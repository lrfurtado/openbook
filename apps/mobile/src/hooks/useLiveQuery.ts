import { useEffect, useEffectEvent, useState } from 'react';
import { subscribe, type DocType } from '@/lib/db';

export interface LiveQuery<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
}

/**
 * Runs an async SQLite query and re-runs it whenever `deps` change or one of `tables` is written, so
 * screens stay in sync with writes made anywhere in the app.
 */
export function useLiveQuery<T>(query: () => Promise<T>, tables: readonly DocType[], deps: readonly unknown[]): LiveQuery<T> {
  const [result, setResult] = useState<{ data?: T; error: Error | null }>({ error: null });
  const [version, setVersion] = useState(0);
  const tablesKey = tables.join(',');
  const runQuery = useEffectEvent(() => query());

  useEffect(() => {
    const watched = new Set(tablesKey.split(','));
    return subscribe((changed) => {
      for (const t of changed) if (watched.has(t)) return setVersion((v) => v + 1);
    });
  }, [tablesKey]);

  useEffect(() => {
    let alive = true;
    runQuery().then(
      (data) => alive && setResult({ data, error: null }),
      (e: unknown) => alive && setResult((r) => ({ ...r, error: e instanceof Error ? e : new Error(String(e)) })),
    );
    return () => {
      alive = false;
    };
    // `deps` is the caller's dependency list for `query`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return { data: result.data, error: result.error, loading: result.data === undefined && !result.error };
}
