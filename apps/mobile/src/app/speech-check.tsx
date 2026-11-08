import * as Speech from 'expo-speech';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

/**
 * M4.6 Step 0: a throwaway, development-only screen that measures how the device voice behaves on each
 * platform. Delete it once the results are recorded in SPECS.md.
 */

const NAME = 'Bald Eagle';
const LONG_PAGE =
  'The little bird sat in the tall green tree and sang a happy song to the sun. ' +
  'Then the big brown dog ran down the long road to find his friend at the red house. ' +
  'They played in the warm grass all day, and when the moon came up, they went home to sleep.';
const MAX_VOICES = 6;
const GAP_MS = 1500;
const VOICE_LIST_LIMIT_MS = 3000;

type WebVoiceFields = { localService?: boolean };

interface Result {
  test: string;
  voice: string;
  outcome: string;
  startMs: number | null;
  totalMs: number | null;
  boundaries: number;
  firstCharIndexes: number[];
}

/** Same formula as speechSafetyMs in §9.5, so a run also shows whether the timeout is long enough. */
const safetyMs = (text: string) => 2000 + 200 * text.length;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function speakOnce(test: string, text: string, voice?: Speech.Voice): Promise<Result> {
  return new Promise((resolve) => {
    const began = Date.now();
    const result: Result = { test, voice: voice?.name ?? 'default', outcome: '', startMs: null, totalMs: null, boundaries: 0, firstCharIndexes: [] };
    let settled = false;
    const settle = (outcome: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, outcome, totalMs: Date.now() - began });
    };
    const timer = setTimeout(() => {
      Speech.stop();
      settle('safety-timeout');
    }, safetyMs(text));
    Speech.speak(text, {
      language: voice ? undefined : 'en',
      voice: voice?.identifier,
      onStart: () => {
        result.startMs = Date.now() - began;
      },
      onBoundary: ((e: { charIndex?: number }) => {
        result.boundaries += 1;
        if (result.firstCharIndexes.length < 5 && typeof e?.charIndex === 'number') result.firstCharIndexes.push(e.charIndex);
      }) as Speech.SpeechOptions['onBoundary'],
      onDone: () => settle('done'),
      onStopped: () => settle('stopped'),
      onError: (e) => settle(`error: ${e instanceof Error ? e.message : String(e)}`),
    });
  });
}

export default function SpeechCheck() {
  const [report, setReport] = useState('');
  const [status, setStatus] = useState('Idle');
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setReport('');
    try {
      await Speech.stop();
      // On web this promise never settles if the browser has no voices.
      const voices = await Promise.race([Speech.getAvailableVoicesAsync(), wait(VOICE_LIST_LIMIT_MS).then((): Speech.Voice[] => [])]);
      const english = voices.filter((v) => v.language.toLowerCase().startsWith('en'));
      const results: Result[] = [];
      const record = async (test: string, text: string, voice?: Speech.Voice) => {
        setStatus(`Running: ${test}`);
        results.push(await speakOnce(test, text, voice));
      };

      await record('default-voice-name', NAME);
      for (const voice of english.slice(0, MAX_VOICES)) await record('english-voice-name', NAME, voice);
      // These run from timers, with no new tap, the way later cards in a session do.
      for (let i = 1; i <= 3; i++) {
        await wait(GAP_MS);
        await record(`no-gesture-card-${i}`, NAME);
      }
      await record('longest-page', LONG_PAGE);

      setReport(
        JSON.stringify(
          {
            platform: Platform.OS,
            version: Platform.Version,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
            voiceCount: voices.length,
            englishVoices: english.map((v) => ({
              id: v.identifier,
              name: v.name,
              language: v.language,
              quality: v.quality,
              localService: (v as WebVoiceFields).localService,
            })),
            results,
          },
          null,
          2,
        ),
      );
      setStatus('Finished');
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  if (!__DEV__) return null;
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>Speech check</Text>
      <Text>Run once normally, then again with the network off. On an iPhone, also run with silent mode on.</Text>
      <Pressable
        accessibilityRole="button"
        disabled={running}
        onPress={run}
        testID="run-speech-check"
        style={{ padding: 14, borderRadius: 8, alignSelf: 'flex-start', backgroundColor: running ? '#999' : '#1565C0' }}
      >
        <Text style={{ color: '#FFF', fontWeight: '700' }}>{running ? 'Running…' : 'Run checks'}</Text>
      </Pressable>
      <Text testID="speech-check-status">{status}</Text>
      {!!report && (
        <View>
          <Text selectable testID="speech-check-report" style={{ fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12 }}>
            {report}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
