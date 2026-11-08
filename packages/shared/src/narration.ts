import { NO_VOICE_RETRY_MS, SPEECH_SAFETY_BASE_MS, SPEECH_SAFETY_PER_CHAR_MS, VOICE_LIST_LIMIT_MS } from './defaults';
import type { Book, ChildSettings } from './types';
import type { ReaderPage } from './books';
import { loc } from './util';

// This package builds without DOM or Node types; every supported runtime provides these timers.
declare function setTimeout(callback: () => void, ms: number): unknown;
declare function clearTimeout(timer: unknown): void;

export type NarrationSource = 'recording' | 'device' | 'silent';
export type NarrationSurface = 'cards' | 'books';

/** FR-82: what should be heard for one card name or book page. */
export function selectNarration(
  settings: Pick<ChildSettings, 'audio' | 'readAloudCards' | 'readAloudBooks'>,
  surface: NarrationSurface,
  item: { hasRecording: boolean; readAloud?: boolean },
): NarrationSource {
  if (item.hasRecording && settings.audio) return 'recording';
  const enabled = surface === 'cards' ? settings.readAloudCards : settings.readAloudBooks;
  return enabled && item.readAloud !== false ? 'device' : 'silent';
}

/** FR-87: the text a reader page reads aloud, or null for pages with nothing to read. */
export function pageNarration(book: Pick<Book, 'title' | 'pages'>, page: ReaderPage): { text: string; hasRecording: boolean } | null {
  if (page.kind === 'cover') return { text: loc(book.title), hasRecording: false };
  if (page.kind === 'text' || page.kind === 'spread') {
    const p = book.pages[page.pageIndex];
    return { text: loc(p.text), hasRecording: !!p.voiceRecordingId };
  }
  return null;
}

/** §9.5: far longer than normal speech, so it only acts when a voice fails to report finishing. */
export function speechSafetyMs(text: string): number {
  return SPEECH_SAFETY_BASE_MS + SPEECH_SAFETY_PER_CHAR_MS * text.length;
}

/** The words of a page as the reader draws them. Highlight indexes refer to this list. */
export function displayWords(text: string): string[] {
  return text.match(/\S+/g) ?? [];
}

/** §9.5: the displayed word a speech position falls in or just before, or null past the last word. */
export function wordIndexAt(text: string, charIndex: number): number | null {
  let end = 0;
  const words = displayWords(text);
  for (let i = 0; i < words.length; i++) {
    end = text.indexOf(words[i], end) + words[i].length;
    if (charIndex < end) return i;
  }
  return null;
}

export interface VoiceInfo {
  identifier: string;
  language: string;
  quality?: string;
  /** Web only: false means the browser sends the text to a remote service. */
  localService?: boolean;
  /** Web only. */
  isDefault?: boolean;
}

export type NarrationPlatform = 'ios' | 'android' | 'web';

/** Novelty and low-quality system voices on Apple platforms. */
const UNSUITABLE_VOICE = /speech\.synthesis|eloquence/i;

function runsOnDevice(voice: VoiceInfo, platform: NarrationPlatform): boolean {
  if (platform === 'web') return voice.localService === true;
  if (platform === 'android') return !/network/i.test(voice.identifier);
  return true;
}

/** FR-80, FR-81: the best on-device English voice, or null if there is none. */
export function chooseVoice(voices: readonly VoiceInfo[], platform: NarrationPlatform): string | null {
  const score = (v: VoiceInfo) => (v.isDefault ? 4 : 0) + (v.quality === 'Enhanced' ? 2 : 0) + (/^en[-_]us/i.test(v.language) ? 1 : 0);
  let best: VoiceInfo | null = null;
  for (const voice of voices) {
    if (!voice.language.toLowerCase().startsWith('en') || UNSUITABLE_VOICE.test(voice.identifier) || !runsOnDevice(voice, platform)) continue;
    if (!best || score(voice) > score(best)) best = voice;
  }
  return best?.identifier ?? null;
}

export interface SpeechEngine {
  listVoices(): Promise<VoiceInfo[]>;
  speak(
    text: string,
    options: { voice: string; onDone: () => void; onStopped: () => void; onError: () => void; onBoundary: (charIndex: number) => void },
  ): void;
  stop(): void;
}

export interface SpeakHandlers {
  onFinished?: () => void;
  onBoundary?: (charIndex: number) => void;
}

export interface Narrator {
  /** The chosen voice, or null if this device has no eligible voice. */
  voice(): Promise<string | null>;
  /** Replaces any current speech. The returned function stops it without calling `onFinished`. */
  speak(text: string, handlers?: SpeakHandlers): () => void;
}

/** §9.5: one speaker at a time, with stale callbacks ignored and a timeout in case a voice never finishes. */
export function createNarrator(engine: SpeechEngine, platform: NarrationPlatform): Narrator {
  let lookup: Promise<string | null> | null = null;
  let noVoiceSince: number | null = null;
  let current = 0;

  const voice = () => {
    if (noVoiceSince !== null && Date.now() - noVoiceSince >= NO_VOICE_RETRY_MS) lookup = null;
    if (!lookup) {
      noVoiceSince = null;
      // On web the voice list never settles if the browser has no voices.
      const limit = new Promise<VoiceInfo[]>((resolve) => setTimeout(() => resolve([]), VOICE_LIST_LIMIT_MS));
      lookup = Promise.race([engine.listVoices(), limit])
        .then((voices) => chooseVoice(voices, platform))
        .catch(() => null)
        .then((id) => {
          if (id === null) noVoiceSince = Date.now();
          return id;
        });
    }
    return lookup;
  };

  const speak = (text: string, handlers: SpeakHandlers = {}) => {
    const mine = ++current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      clearTimeout(timer);
      if (mine === current) handlers.onFinished?.();
    };

    engine.stop();
    void voice().then((id) => {
      if (over || mine !== current) return;
      if (id === null) return finish();
      timer = setTimeout(() => {
        if (mine === current) engine.stop();
        finish();
      }, speechSafetyMs(text));
      engine.speak(text, {
        voice: id,
        onDone: finish,
        onStopped: finish,
        onError: finish,
        onBoundary: (charIndex) => {
          if (!over && mine === current) handlers.onBoundary?.(charIndex);
        },
      });
    });

    return () => {
      if (over || mine !== current) return;
      over = true;
      current++;
      clearTimeout(timer);
      engine.stop();
    };
  };

  return { voice, speak };
}
