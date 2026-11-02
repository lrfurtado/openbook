import { Directory, File, Paths } from 'expo-file-system';
import type { MediaStore } from './media.types';

/** Native MediaStore: files under <documents>/media. Keys like "cards/<id>.jpg" are flattened. */
const root = new Directory(Paths.document, 'media');

function ensureRoot() {
  if (!root.exists) root.create({ intermediates: true, idempotent: true });
}

const fileFor = (key: string) => new File(root, key.replace(/\//g, '__'));

const USER_AGENT = 'OpenBook/1.0 (offline flash card app; https://openbook.app)';

export const media: MediaStore = {
  async has(key) {
    const f = fileFor(key);
    return f.exists && f.size > 0;
  },

  async download(url, key) {
    ensureRoot();
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Write to a temp file and move it into place so an interrupted download never looks complete.
    const part = fileFor(`${key}.part`);
    if (part.exists) part.delete();
    part.create();
    part.write(bytes);
    const dest = fileFor(key);
    if (dest.exists) dest.delete();
    part.move(dest);
    return bytes.byteLength;
  },

  async saveFromUri(uri, key) {
    ensureRoot();
    const dest = fileFor(key);
    if (dest.exists) dest.delete();
    new File(uri).copy(dest);
    return dest.size;
  },

  async resolve(key) {
    const f = fileFor(key);
    return f.exists ? f.uri : null;
  },

  async size(key) {
    const f = fileFor(key);
    return f.exists ? f.size : 0;
  },

  async dataUrl(key) {
    const f = fileFor(key);
    if (!f.exists) return null;
    const b64 = await Promise.resolve(f.base64());
    return `data:image/jpeg;base64,${b64}`;
  },

  async remove(key) {
    const f = fileFor(key);
    if (f.exists) f.delete();
  },
};
