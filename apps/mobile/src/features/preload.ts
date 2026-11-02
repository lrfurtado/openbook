import { Image } from 'expo-image';
import { Platform } from 'react-native';

/** FR-28: decode every image before a session starts so there is no flicker. */
export async function preloadImages(uris: readonly string[]): Promise<void> {
  if (!uris.length) return;
  if (Platform.OS === 'web') {
    await Promise.all(
      uris.map(async (uri) => {
        const img = new window.Image();
        img.src = uri;
        await img.decode().catch(() => {});
      }),
    );
    return;
  }
  await Image.prefetch([...uris], 'memory-disk').catch(() => false);
}
