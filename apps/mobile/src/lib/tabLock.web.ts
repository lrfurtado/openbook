import type { TabState } from './tabLock';

export type { TabState };

/**
 * expo-sqlite on web keeps exclusive OPFS file handles in its worker, so only one tab can open the
 * database. A Web Lock marks the tab that owns it; a second tab asks before taking over.
 */
const LOCK = 'openbook-db';
const YIELDED = 'openbook-yielded';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('openbook-tabs') : null;

function yielded() {
  try {
    return sessionStorage.getItem(YIELDED) === '1';
  } catch {
    return false;
  }
}

/** Takes the lock for the life of the tab, or reports that another tab holds it. */
export function claimTab(): Promise<TabState> {
  if (!navigator.locks) return Promise.resolve('ok');
  // A tab that stepped aside stays idle until the user asks for it back.
  if (yielded()) return Promise.resolve('busy');
  return new Promise((resolve) => {
    navigator.locks.request(LOCK, { ifAvailable: true }, (lock) => {
      if (!lock) return resolve('busy');
      resolve('ok');
      channel?.addEventListener('message', (e) => {
        if (e.data !== 'take-over') return;
        try {
          sessionStorage.setItem(YIELDED, '1');
        } catch {}
        // Reloading ends this tab's SQLite worker, which frees the files and the lock.
        location.reload();
      });
      return new Promise<void>(() => {});
    });
  });
}

/** Asks the owning tab to step aside, waits for its lock, then reloads this tab as the owner. */
export async function takeOver(): Promise<void> {
  try {
    sessionStorage.removeItem(YIELDED);
  } catch {}
  channel?.postMessage('take-over');
  if (navigator.locks) await navigator.locks.request(LOCK, async () => {});
  // Give the old worker a moment to release its file handles.
  await new Promise((r) => setTimeout(r, 300));
  location.reload();
}
