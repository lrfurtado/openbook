import { createNarrator, type NarrationPlatform } from '@openbook/shared';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

/** The app's single speaker (§4.13), backed by the device's own text-to-speech. */
export const narrator = createNarrator(
  {
    listVoices: () => Speech.getAvailableVoicesAsync(),
    speak: (text, { voice, onDone, onStopped, onError, onBoundary }) =>
      Speech.speak(text, {
        language: 'en',
        voice,
        onDone,
        onStopped,
        onError,
        onBoundary: ((e: { charIndex?: number }) => {
          if (typeof e?.charIndex === 'number') onBoundary(e.charIndex);
        }) as Speech.SpeechOptions['onBoundary'],
      }),
    stop: () => void Speech.stop(),
  },
  Platform.OS as NarrationPlatform,
);
