/** One storage API for downloaded and user-created media, on every platform (§2.1). */
export interface MediaStore {
  has(key: string): Promise<boolean>;
  /** Downloads `url` into `key`; returns the stored size in bytes. */
  download(url: string, key: string): Promise<number>;
  /** Copies a local (file:, blob: or data:) URI into `key`. */
  saveFromUri(uri: string, key: string): Promise<number>;
  /** A URI that <Image> can display, or null when missing. */
  resolve(key: string): Promise<string | null>;
  size(key: string): Promise<number>;
  /** Base64 data URL, used to embed images in print HTML. */
  dataUrl(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
}
