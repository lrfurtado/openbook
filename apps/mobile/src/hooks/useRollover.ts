import { useEffect } from 'react';
import { AppState } from 'react-native';
import { rolloverAll } from '@/lib/repo';

function msToMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  return next.getTime() - now.getTime();
}

/** §9.2: day rollover runs on app foreground and at local midnight. */
export function useRollover(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => rolloverAll().catch((e) => console.warn('rollover failed', e));
    run();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        run();
        arm();
      }, msToMidnight());
    };
    arm();
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [enabled]);
}
