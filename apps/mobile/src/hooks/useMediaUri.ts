import { useEffect, useState } from 'react';
import { media } from '@/lib/media';

/** Resolves a MediaStore key to a displayable URI (falls back to a remote URL while online). */
export function useMediaUri(key?: string, fallbackUrl?: string): string | undefined {
  const [resolved, setResolved] = useState<{ key: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    media.resolve(key).then((uri) => alive && setResolved({ key, uri }));
    return () => {
      alive = false;
    };
  }, [key]);
  if (!key) return fallbackUrl;
  if (resolved?.key !== key) return undefined;
  return resolved.uri ?? fallbackUrl;
}
