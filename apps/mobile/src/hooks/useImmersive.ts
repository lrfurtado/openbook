import { useKeepAwake } from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { PanResponder, Platform, useWindowDimensions } from 'react-native';

/** Web: must be called from a user gesture (e.g. the Start button) — FR-27. */
export function enterFullscreen() {
  if (Platform.OS !== 'web') return;
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

function exitFullscreen() {
  if (Platform.OS === 'web' && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

/**
 * FR-27 / FR-67: landscape lock, immersive full screen and keep-awake for sessions and the reader.
 * Returns `portrait` so web can show a "rotate device" hint.
 */
export function useImmersive(): { portrait: boolean } {
  useKeepAwake();
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    if (Platform.OS === 'android') NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
      if (Platform.OS === 'android') NavigationBar.setVisibilityAsync('visible').catch(() => {});
      exitFullscreen();
    };
  }, []);

  return { portrait: Platform.OS === 'web' && height > width };
}

/** Swipe (left = next, right = previous) and arrow / space keys on web (FR-24, FR-67). */
export function useAdvanceInput(onNext: () => void, onPrev?: () => void) {
  const handlers = useRef({ onNext, onPrev });
  useLayoutEffect(() => {
    handlers.current = { onNext, onPrev };
  });

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      onNext();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') && onPrev) {
      e.preventDefault();
      onPrev();
    }
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // The callbacks read `handlers` only on gestures, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -40) handlers.current.onNext();
        else if (g.dx > 40) (handlers.current.onPrev ?? handlers.current.onNext)();
      },
    }),
  );
  return responder.panHandlers;
}
