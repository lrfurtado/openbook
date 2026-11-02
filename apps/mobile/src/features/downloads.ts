import type { BookSummary, PackSummary } from '@openbook/shared';
import { packManifestSchema } from '@openbook/shared';
import { downloadBook, downloadPack } from '@/lib/repo';
import { catalogApi } from '@/store/api';
import { downloadActions } from '@/store/appSlice';
import type { AppDispatch } from '@/store';

function message(e: unknown) {
  if (e && typeof e === 'object' && 'status' in e) return `Server error (${String((e as { status: unknown }).status)})`;
  return e instanceof Error ? e.message : String(e);
}

/** Fetches a pack manifest, validates it and downloads everything for offline use (FR-3). */
export async function startPackDownload(dispatch: AppDispatch, pack: PackSummary): Promise<boolean> {
  const progress = (done: number, total: number) =>
    dispatch(downloadActions.progress({ id: pack.id, done, total, status: 'downloading' }));
  progress(0, pack.cardCount);
  try {
    const raw = await dispatch(
      catalogApi.endpoints.packManifest.initiate({ id: pack.id, version: pack.version }, { forceRefetch: true, subscribe: false }),
    ).unwrap();
    const manifest = packManifestSchema.parse(raw);
    await downloadPack(manifest as typeof raw, progress);
    dispatch(downloadActions.progress({ id: pack.id, done: manifest.cards.length, total: manifest.cards.length, status: 'done' }));
    return true;
  } catch (e) {
    dispatch(downloadActions.progress({ id: pack.id, done: 0, total: pack.cardCount, status: 'error', error: message(e) }));
    return false;
  }
}

export async function startBookDownload(dispatch: AppDispatch, book: BookSummary): Promise<boolean> {
  const progress = (done: number, total: number) =>
    dispatch(downloadActions.progress({ id: book.id, done, total, status: 'downloading' }));
  progress(0, book.pageCount);
  try {
    const manifest = await dispatch(
      catalogApi.endpoints.bookManifest.initiate({ id: book.id, version: book.version }, { forceRefetch: true, subscribe: false }),
    ).unwrap();
    await downloadBook(manifest, progress);
    dispatch(downloadActions.progress({ id: book.id, done: 1, total: 1, status: 'done' }));
    return true;
  } catch (e) {
    dispatch(downloadActions.progress({ id: book.id, done: 0, total: 1, status: 'error', error: message(e) }));
    return false;
  }
}
