import { getRandomBytes } from 'expo-crypto';
import { uuidv7 } from '@openbook/shared';

export const newId = () => uuidv7(Date.now(), (n) => getRandomBytes(n));
export const nowIso = () => new Date().toISOString();
