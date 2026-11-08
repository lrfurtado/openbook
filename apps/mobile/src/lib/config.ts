import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Web served from a public hostname (e.g. through a tunnel) reaches the API on the same origin at /v1. */
const sameOrigin =
  Platform.OS === 'web' && typeof location !== 'undefined' && !['localhost', '127.0.0.1'].includes(location.hostname) ? `${location.origin}/v1` : undefined;

const configured =
  sameOrigin ?? process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:3000/v1';

/** A relative URL (the packaged web build uses `/v1`) is resolved against the page's origin. */
const absolute = configured.startsWith('/') && typeof location !== 'undefined' ? `${location.origin}${configured}` : configured;

/** The Android emulator reaches the host machine on 10.0.2.2, not localhost. */
export const API_URL = Platform.OS === 'android' ? absolute.replace('://localhost', '://10.0.2.2') : absolute;
