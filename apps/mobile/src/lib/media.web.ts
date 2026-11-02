import type { MediaStore } from './media.types';

/** Web MediaStore: blobs in Cache Storage, exposed to <Image> as object URLs. */
const CACHE = 'openbook-media-v1';
const objectUrls = new Map<string, string>();

const requestFor = (key: string) => new Request(`${location.origin}/__media/${encodeURI(key)}`);
const open = () => caches.open(CACHE);

async function put(key: string, blob: Blob) {
  const cache = await open();
  await cache.put(requestFor(key), new Response(blob, { headers: { 'content-type': blob.type || 'image/jpeg' } }));
  const old = objectUrls.get(key);
  if (old) URL.revokeObjectURL(old);
  objectUrls.delete(key);
  return blob.size;
}

async function blobFor(key: string): Promise<Blob | null> {
  const res = await (await open()).match(requestFor(key));
  return res ? res.blob() : null;
}

// Ask the browser not to evict downloaded packs under storage pressure (NFR-10).
if (typeof navigator !== 'undefined') navigator.storage?.persist?.().catch(() => {});

export const media: MediaStore = {
  async has(key) {
    return !!(await (await open()).match(requestFor(key)));
  },

  async download(url, key) {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    return put(key, await res.blob());
  },

  async saveFromUri(uri, key) {
    const res = await fetch(uri);
    return put(key, await res.blob());
  },

  async resolve(key) {
    const cached = objectUrls.get(key);
    if (cached) return cached;
    const blob = await blobFor(key);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    objectUrls.set(key, url);
    return url;
  },

  async size(key) {
    return (await blobFor(key))?.size ?? 0;
  },

  async dataUrl(key) {
    const blob = await blobFor(key);
    if (!blob) return null;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  },

  async remove(key) {
    await (await open()).delete(requestFor(key));
    const url = objectUrls.get(key);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(key);
  },
};
