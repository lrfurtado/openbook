import Constants from 'expo-constants';
import { Platform } from 'react-native';

const configured = process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:3000/v1';

/** The Android emulator reaches the host machine on 10.0.2.2, not localhost. */
export const API_URL = Platform.OS === 'android' ? configured.replace('://localhost', '://10.0.2.2') : configured;
