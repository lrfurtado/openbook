import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from 'expo-crypto';
import { secure } from './secure';

const KEY = 'openbook.pin';

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const hash = (salt: string, pin: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);

/** FR-52: the PIN is stored as a salted SHA-256 hash in secure storage. */
export async function setPin(pin: string): Promise<void> {
  const salt = toHex(getRandomBytes(16));
  await secure.set(KEY, `${salt}$${await hash(salt, pin)}`);
}

export async function hasPin(): Promise<boolean> {
  return !!(await secure.get(KEY));
}

export async function checkPin(pin: string): Promise<boolean> {
  const stored = await secure.get(KEY);
  if (!stored) return false;
  const [salt, digest] = stored.split('$');
  return (await hash(salt, pin)) === digest;
}
