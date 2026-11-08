import {
  DEFAULT_CHILD_SETTINGS,
  isCompleted,
  pageNarration,
  pageSequence,
  PAGE_TURN_MS,
  selectNarration,
  wordIndexAt,
  type Book,
  type BookLayout,
  type ChildSettings,
} from '@openbook/shared';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BookPageView } from '@/components/BookPage';
import { ExitCorner, PauseOverlay, RotateHint } from '@/components/Immersive';
import { narrator } from '@/features/narration';
import { preloadImages } from '@/features/preload';
import { PREVIEW_CHILD } from '@/features/reader';
import { useAdvanceInput, useImmersive } from '@/hooks/useImmersive';
import { newId, nowIso } from '@/lib/ids';
import { media } from '@/lib/media';
import { addLog, getBook, getChild } from '@/lib/repo';
import { useAppDispatch } from '@/store';
import { appActions } from '@/store/appSlice';
import { goBack } from '@/lib/nav';

/** FR-67..73: the fullscreen, parent-paced book reader. */
export default function Reader() {
  const { t } = useTranslation();
  const { childId, bookId, activeBookId, layout: layoutParam } = useLocalSearchParams<{
    childId: string;
    bookId: string;
    activeBookId?: string;
    layout?: BookLayout;
  }>();
  const dispatch = useAppDispatch();
  const { portrait } = useImmersive();
  const { width, height } = useWindowDimensions();

  const [book, setBook] = useState<Book | null>(null);
  const [layout, setLayout] = useState<BookLayout>('text-then-picture');
  const [autoSeconds, setAutoSeconds] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [highlighted, setHighlighted] = useState<Set<number>>(new Set());
  const [settings, setSettings] = useState<ChildSettings>(DEFAULT_CHILD_SETTINGS);
  const [finishedRun, setFinishedRun] = useState<string | null>(null);
  const [spokenWord, setSpokenWord] = useState<number | null>(null);
  const [replays, setReplays] = useState(0);
  const maxIndex = useRef(0);
  const startedAt = useRef(nowIso());
  const finished = useRef(false);
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    (async () => {
      void narrator.voice();
      const [b, ch] = await Promise.all([getBook(bookId), childId === PREVIEW_CHILD ? null : getChild(childId)]);
      if (!b) return goBack(childId === PREVIEW_CHILD ? '/home' : `/${childId}/bookshelf`);
      setLayout(layoutParam ?? ch?.settings.bookLayout ?? b.layout);
      setAutoSeconds(ch?.settings.pageAutoAdvanceSeconds ?? null);
      if (ch) setSettings(ch.settings);
      const uris = await Promise.all(b.pages.map((p) => (p.image?.localPath ? media.resolve(p.image.localPath) : null)));
      await preloadImages(uris.filter((u): u is string => !!u));
      startedAt.current = nowIso();
      setBook(b);
    })();
  }, [bookId, childId, layoutParam]);

  // FR-70: every reading starts from the cover.
  const sequence = useMemo(() => (book ? pageSequence(book, layout) : []), [book, layout]);

  const finish = useCallback(async () => {
    if (finished.current || !book) return;
    finished.current = true;
    dispatch(appActions.readerPageReached({ bookId, page: maxIndex.current }));
    if (childId !== PREVIEW_CHILD) {
      await addLog({
        id: newId(),
        childId,
        type: 'reading',
        activeBookId,
        bookId,
        startedAt: startedAt.current,
        endedAt: nowIso(),
        pagesShown: maxIndex.current + 1,
        completed: isCompleted(maxIndex.current + 1, sequence.length),
      });
    }
    goBack(childId === PREVIEW_CHILD ? '/home' : `/${childId}/bookshelf`);
  }, [book, bookId, childId, activeBookId, sequence.length, dispatch]);

  const go = useCallback(
    (next: number) => {
      if (paused || !sequence.length) return;
      if (next >= sequence.length) return void finish();
      if (next < 0) return;
      opacity.setValue(0);
      setHighlighted(new Set());
      setIndex(next);
      maxIndex.current = Math.max(maxIndex.current, next);
      Animated.timing(opacity, { toValue: 1, duration: PAGE_TURN_MS, useNativeDriver: true }).start();
    },
    [paused, sequence.length, finish, opacity],
  );

  // FR-87..90: read the page when it opens or on replay. Turning the page or pausing re-runs this and stops speech.
  const narration = book && sequence[index] ? pageNarration(book, sequence[index]) : null;
  const spokenText =
    book && narration && selectNarration(settings, 'books', { hasRecording: narration.hasRecording, readAloud: book.readAloud }) === 'device'
      ? narration.text
      : null;
  const run = `${index}:${replays}`;
  const speaking = spokenText !== null && !paused && finishedRun !== run;
  useEffect(() => {
    if (spokenText === null || paused) return;
    const cancel = narrator.speak(spokenText, {
      onBoundary: (charIndex) => setSpokenWord(wordIndexAt(spokenText, charIndex)),
      onFinished: () => {
        setSpokenWord(null);
        setFinishedRun(run);
      },
    });
    return () => {
      cancel();
      setSpokenWord(null);
    };
  }, [spokenText, paused, run]);

  // FR-88: the optional page timer starts once speech has ended.
  useEffect(() => {
    if (!autoSeconds || paused || !book || speaking) return;
    const timer = setTimeout(() => go(index + 1), autoSeconds * 1000);
    return () => clearTimeout(timer);
  }, [autoSeconds, paused, book, index, go, speaking]);

  const pan = useAdvanceInput(
    () => go(index + 1),
    () => go(index - 1),
  );

  const page = sequence[index];
  return (
    <View style={styles.root} {...pan}>
      <StatusBar hidden />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => go(index + 1)} accessibilityLabel={t('reader.next')} />
      {book && page && (
        <Animated.View style={[styles.page, { opacity }]} pointerEvents="box-none">
          <BookPageView
            book={book}
            page={page}
            width={width}
            height={height}
            highlighted={highlighted}
            spokenWord={spokenWord}
            onWordPress={(i) =>
              setHighlighted((h) => {
                const next = new Set(h);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                return next;
              })
            }
          />
        </Animated.View>
      )}
      {book && <Text style={styles.indicator}>{`${index + 1} / ${sequence.length}`}</Text>}
      {index > 0 && (
        <Pressable accessibilityLabel={t('reader.previous')} onPress={() => go(index - 1)} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      )}
      {spokenText !== null && (
        <Pressable accessibilityLabel={t('reader.replay')} onPress={() => setReplays((n) => n + 1)} style={styles.replay}>
          <Text style={styles.replayText}>🔊</Text>
        </Pressable>
      )}
      <ExitCorner onLongPress={() => setPaused(true)} />
      {paused && <PauseOverlay onResume={() => setPaused(false)} onExit={finish} />}
      {portrait && <RotateHint />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  page: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  indicator: { position: 'absolute', right: 14, bottom: 8, fontSize: 11, color: '#C8C8C8' },
  back: { position: 'absolute', left: 0, bottom: 0, width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 32, color: '#E0E0E0' },
  replay: { position: 'absolute', left: '50%', marginLeft: -32, bottom: 0, width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  replayText: { fontSize: 26, opacity: 0.45 },
});
