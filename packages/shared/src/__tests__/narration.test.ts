import { DEFAULT_CHILD_SETTINGS, withDefaultSettings } from '../defaults';
import {
  chooseVoice,
  createNarrator,
  displayWords,
  pageNarration,
  selectNarration,
  speechSafetyMs,
  wordIndexAt,
  type SpeechEngine,
  type VoiceInfo,
} from '../narration';
import type { ChildSettings } from '../types';

const settings = { audio: true, readAloudCards: true, readAloudBooks: true };
const enUs: VoiceInfo = { identifier: 'local-us', language: 'en-US', localService: true };

type SpeakOptions = Parameters<SpeechEngine['speak']>[1];

function fakeEngine(voices: VoiceInfo[] | Promise<VoiceInfo[]> = [enUs]) {
  const spoken: { text: string; options: SpeakOptions }[] = [];
  const engine: SpeechEngine = {
    listVoices: () => Promise.resolve(voices),
    speak: (text, options) => void spoken.push({ text, options }),
    stop: jest.fn(),
  };
  return { engine, spoken };
}

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('selectNarration (FR-82)', () => {
  it('prefers a recording while audio is on', () => {
    expect(selectNarration(settings, 'cards', { hasRecording: true })).toBe('recording');
  });

  it('uses the device voice for a recording when audio is off', () => {
    expect(selectNarration({ ...settings, audio: false }, 'cards', { hasRecording: true })).toBe('device');
  });

  it('keeps the card and book switches independent', () => {
    const cardsOff = { ...settings, readAloudCards: false };
    expect(selectNarration(cardsOff, 'cards', { hasRecording: false })).toBe('silent');
    expect(selectNarration(cardsOff, 'books', { hasRecording: false })).toBe('device');
  });

  it('per-item off silences only the device voice', () => {
    expect(selectNarration(settings, 'books', { hasRecording: false, readAloud: false })).toBe('silent');
    expect(selectNarration(settings, 'books', { hasRecording: true, readAloud: false })).toBe('recording');
  });
});

describe('pageNarration (FR-87)', () => {
  const book = { title: { en: 'My Dog' }, pages: [{ id: 'p', text: { en: 'A big dog' } }] };

  it('reads the cover title and text pages', () => {
    expect(pageNarration(book, { kind: 'cover' })?.text).toBe('My Dog');
    expect(pageNarration(book, { kind: 'text', pageIndex: 0 })?.text).toBe('A big dog');
    expect(pageNarration(book, { kind: 'spread', pageIndex: 0 })?.text).toBe('A big dog');
  });

  it('leaves picture and end pages silent', () => {
    expect(pageNarration(book, { kind: 'picture', pageIndex: 0 })).toBeNull();
    expect(pageNarration(book, { kind: 'end' })).toBeNull();
  });
});

describe('wordIndexAt (§9.5)', () => {
  const text = 'The well-known  dog';

  it('matches the words as displayed', () => {
    expect(displayWords(text)).toEqual(['The', 'well-known', 'dog']);
  });

  it('maps positions to words', () => {
    expect(wordIndexAt(text, 0)).toBe(0);
    expect(wordIndexAt(text, 4)).toBe(1);
    expect(wordIndexAt(text, 9)).toBe(1);
    expect(wordIndexAt(text, 16)).toBe(2);
  });

  it('treats a gap as the next word and past the end as none', () => {
    expect(wordIndexAt(text, 3)).toBe(1);
    expect(wordIndexAt(text, 99)).toBeNull();
  });

  it('handles a repeated word', () => {
    expect(wordIndexAt('dog dog', 4)).toBe(1);
  });
});

describe('chooseVoice (FR-80, FR-81)', () => {
  it('never picks a remote web voice', () => {
    expect(chooseVoice([{ identifier: 'cloud', language: 'en-US', localService: false, isDefault: true }], 'web')).toBeNull();
    expect(chooseVoice([{ identifier: 'cloud', language: 'en-US', isDefault: true }, enUs], 'web')).toBe('local-us');
  });

  it('skips Android network voices', () => {
    const voices = [
      { identifier: 'en-us-x-sfg-network', language: 'en-US', quality: 'Enhanced' },
      { identifier: 'en-us-x-sfg-local', language: 'en-US' },
    ];
    expect(chooseVoice(voices, 'android')).toBe('en-us-x-sfg-local');
  });

  it('prefers higher quality, and skips other languages and novelty voices', () => {
    const voices = [
      { identifier: 'com.apple.speech.synthesis.voice.Zarvox', language: 'en-US', quality: 'Enhanced' },
      { identifier: 'fr', language: 'fr-FR', quality: 'Enhanced' },
      { identifier: 'plain', language: 'en-GB' },
      { identifier: 'enhanced', language: 'en-GB', quality: 'Enhanced' },
    ];
    expect(chooseVoice(voices, 'ios')).toBe('enhanced');
  });

  it('returns null when nothing qualifies', () => {
    expect(chooseVoice([], 'ios')).toBeNull();
  });
});

describe('withDefaultSettings (FR-83)', () => {
  it('turns read-aloud on for profiles saved before the feature', () => {
    const { readAloudCards: _c, readAloudBooks: _b, ...old } = DEFAULT_CHILD_SETTINGS;
    const merged = withDefaultSettings({ ...old, secondsPerCard: 2 } as ChildSettings);
    expect(merged.readAloudCards).toBe(true);
    expect(merged.readAloudBooks).toBe(true);
    expect(merged.secondsPerCard).toBe(2);
  });

  it('keeps a saved off switch', () => {
    expect(withDefaultSettings({ ...DEFAULT_CHILD_SETTINGS, readAloudBooks: false }).readAloudBooks).toBe(false);
  });
});

describe('createNarrator (§9.5)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('speaks with the chosen voice and reports finishing', async () => {
    const { engine, spoken } = fakeEngine();
    const onFinished = jest.fn();
    createNarrator(engine, 'web').speak('Bald Eagle', { onFinished });
    await flush();
    expect(spoken[0].options.voice).toBe('local-us');
    expect(onFinished).not.toHaveBeenCalled();
    spoken[0].options.onDone();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('stops earlier speech first and ignores its callbacks', async () => {
    const { engine, spoken } = fakeEngine();
    const first = jest.fn();
    const narrator = createNarrator(engine, 'web');
    narrator.speak('one', { onFinished: first, onBoundary: first });
    await flush();
    const second = jest.fn();
    narrator.speak('two', { onFinished: second });
    await flush();
    expect(engine.stop).toHaveBeenCalledTimes(2);
    spoken[0].options.onBoundary(0);
    spoken[0].options.onStopped();
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('does not speak if cancelled while the voice is loading', async () => {
    const { engine, spoken } = fakeEngine();
    const onFinished = jest.fn();
    createNarrator(engine, 'web').speak('one', { onFinished })();
    await flush();
    expect(spoken).toHaveLength(0);
    expect(onFinished).not.toHaveBeenCalled();
  });

  it('cancel stops speech without reporting finished', async () => {
    const { engine, spoken } = fakeEngine();
    const onFinished = jest.fn();
    const cancel = createNarrator(engine, 'web').speak('one', { onFinished });
    await flush();
    cancel();
    spoken[0].options.onDone();
    expect(onFinished).not.toHaveBeenCalled();
    expect(engine.stop).toHaveBeenCalledTimes(2);
  });

  it('finishes by the safety timeout if the voice never reports back', async () => {
    const { engine } = fakeEngine();
    const onFinished = jest.fn();
    createNarrator(engine, 'web').speak('Bald Eagle', { onFinished });
    await flush();
    jest.advanceTimersByTime(speechSafetyMs('Bald Eagle') - 1);
    expect(onFinished).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('an old safety timeout does not stop newer speech', async () => {
    const { engine } = fakeEngine();
    const narrator = createNarrator(engine, 'web');
    narrator.speak('a');
    await flush();
    narrator.speak('a much longer sentence than the first one');
    await flush();
    const stops = (engine.stop as jest.Mock).mock.calls.length;
    jest.advanceTimersByTime(speechSafetyMs('a'));
    expect(engine.stop).toHaveBeenCalledTimes(stops);
  });

  it('finishes at once with no eligible voice', async () => {
    const { engine, spoken } = fakeEngine([]);
    const onFinished = jest.fn();
    createNarrator(engine, 'web').speak('one', { onFinished });
    await flush();
    expect(spoken).toHaveLength(0);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('gives up on a voice list that never settles', async () => {
    const { engine } = fakeEngine(new Promise<VoiceInfo[]>(() => {}));
    const onFinished = jest.fn();
    createNarrator(engine, 'web').speak('one', { onFinished });
    await jest.advanceTimersByTimeAsync(3000);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('looks up the voice only once when one is found', async () => {
    const { engine } = fakeEngine();
    const list = jest.spyOn(engine, 'listVoices');
    const narrator = createNarrator(engine, 'web');
    await narrator.voice();
    await narrator.voice();
    expect(list).toHaveBeenCalledTimes(1);
  });
});
