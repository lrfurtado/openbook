import {
  buildSessionOrder,
  CAPTION_GREY,
  cardHoldMs,
  CROSSFADE_MS,
  END_CARD_MS,
  isCompleted,
  NAME_RED,
  pickFact,
  type Card,
  type CardProgress,
  type ChildProfile,
  type FactLevel,
} from '@openbook/shared';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ExitCorner, PauseOverlay, RotateHint } from '@/components/Immersive';
import { preloadImages } from '@/features/preload';
import { useAdvanceInput, useImmersive } from '@/hooks/useImmersive';
import { newId, nowIso } from '@/lib/ids';
import { media } from '@/lib/media';
import { addLog, getCards, getChild, getSet, listProgress, saveProgress } from '@/lib/repo';
import { useAppDispatch, useAppSelector } from '@/store';
import { appActions } from '@/store/appSlice';
import { goBack } from '@/lib/nav';

interface Slide {
  card: Card;
  uri: string;
  fact: string | null;
}

type Phase = 'loading' | 'running' | 'paused' | 'end' | 'empty';

/** FR-24..31, §9.1: the fullscreen flashing screen. */
export default function Session() {
  const { childId, setId } = useLocalSearchParams<{ childId: string; setId: string }>();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const lastCard = useAppSelector((s) => s.app.lastCardBySet[setId]);
  const rotation = useAppSelector((s) => s.app.sessionCountBySet[setId] ?? 0);
  const { portrait } = useImmersive();
  const { width, height } = useWindowDimensions();

  const [child, setChild] = useState<ChildProfile | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [index, setIndex] = useState(0);
  const [beat, setBeat] = useState<0 | 1>(0);
  const shown = useRef(new Set<number>());
  const startedAt = useRef(nowIso());
  const progressRef = useRef(new Map<string, CardProgress>());
  const finished = useRef(false);

  // Load, order and preload (§9.1 steps 1–3).
  useEffect(() => {
    let alive = true;
    (async () => {
      const [ch, set] = await Promise.all([getChild(childId), getSet(setId)]);
      if (!ch || !set) return alive && setPhase('empty');
      const progress = new Map((await listProgress(childId)).map((p) => [p.cardId, p]));
      progressRef.current = progress;
      const cards = new Map((await getCards(set.cardIds)).map((c) => [c.id, c]));
      const order = buildSessionOrder(set.cardIds.filter((id) => cards.has(id)), ch.settings.sessionSize, lastCard);
      const built: Slide[] = [];
      for (const id of order) {
        const card = cards.get(id)!;
        const uri = card.image.localPath ? await media.resolve(card.image.localPath) : null;
        if (!uri) continue;
        const level = (progress.get(id)?.factLevel ?? 1) as FactLevel;
        built.push({ card, uri, fact: pickFact(card, level, rotation) });
      }
      await preloadImages(built.map((s) => s.uri));
      if (!alive) return;
      setChild(ch);
      setSlides(built);
      startedAt.current = nowIso();
      setPhase(built.length ? 'running' : 'empty');
    })();
    return () => {
      alive = false;
    };
    // Load once per mount; settings changes apply to the next session (AC-3).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, setId]);

  useEffect(() => {
    if (phase === 'running' && slides[index]) shown.current.add(index);
  }, [phase, index, slides]);

  const finish = useCallback(
    async (reachedEnd: boolean) => {
      if (finished.current) return;
      finished.current = true;
      const shownIdx = [...shown.current].sort((a, b) => a - b);
      const cardIdsShown = shownIdx.map((i) => slides[i].card.id);
      const now = nowIso();
      await addLog({
        id: newId(),
        childId,
        type: 'flash',
        setId,
        startedAt: startedAt.current,
        endedAt: now,
        cardIdsShown,
        completed: isCompleted(cardIdsShown.length, slides.length),
      });
      await saveProgress(
        cardIdsShown.map((cardId) => {
          const p = progressRef.current.get(cardId);
          return { childId, cardId, cycles: p?.cycles ?? 0, factLevel: p?.factLevel ?? 1, lastShownAt: now };
        }),
      );
      dispatch(appActions.sessionFinished({ setId, lastCardId: cardIdsShown[cardIdsShown.length - 1] }));
      if (reachedEnd) {
        setPhase('end');
        setTimeout(() => goBack(`/${childId}/today`), END_CARD_MS);
      } else goBack(`/${childId}/today`);
    },
    [childId, setId, slides, dispatch],
  );

  const twoBeats = child?.settings.nameDisplay === 'after';

  const advance = useCallback(() => {
    if (phase !== 'running') return;
    if (twoBeats && beat === 0) return setBeat(1);
    if (index + 1 < slides.length) {
      setIndex(index + 1);
      setBeat(0);
    } else finish(true);
  }, [phase, twoBeats, beat, index, slides.length, finish]);

  // Auto-advance; any manual advance changes index/beat and so resets this timer (FR-24).
  useEffect(() => {
    if (phase !== 'running' || !child) return;
    const timer = setTimeout(advance, cardHoldMs(child.settings.secondsPerCard));
    return () => clearTimeout(timer);
  }, [phase, index, beat, child, advance]);

  const pan = useAdvanceInput(advance);

  if (phase === 'end') return <EndCard />;

  const slide = slides[index];
  const nameSize = Math.min(height * 0.15, slide ? (width * 0.9) / Math.max(4, slide.card.name.en.length * 0.62) : 0);
  const soloNameSize = Math.min(height * 0.22, slide ? (width * 0.9) / Math.max(4, slide.card.name.en.length * 0.62) : 0);

  return (
    <View style={styles.root} {...pan}>
      <StatusBar hidden />
      <Pressable style={StyleSheet.absoluteFill} onPress={advance} accessibilityLabel={t('session.next')} />
      {slide && phase !== 'loading' && (
        <View style={styles.stage} pointerEvents="none">
          {!(twoBeats && beat === 1) ? (
            <>
              <Image
                source={{ uri: slide.uri }}
                style={styles.image}
                contentFit="contain"
                transition={{ duration: CROSSFADE_MS, effect: 'cross-dissolve' }}
                accessibilityLabel={slide.card.name.en}
              />
              {child?.settings.nameDisplay === 'below' && (
                <Text style={[styles.name, { fontSize: nameSize, lineHeight: nameSize * 1.15 }]} numberOfLines={1}>
                  {slide.card.name.en}
                </Text>
              )}
            </>
          ) : (
            <FadeIn key={`name-${index}`} style={styles.nameStage}>
              <Text style={[styles.name, { fontSize: soloNameSize, lineHeight: soloNameSize * 1.15 }]} numberOfLines={2}>
                {slide.card.name.en}
              </Text>
            </FadeIn>
          )}
          {child?.settings.factCaption && slide.fact && <Text style={styles.caption}>{slide.fact}</Text>}
        </View>
      )}
      {phase === 'empty' && (
        <View style={styles.stage}>
          <Text style={{ fontSize: 22, color: '#444' }}>{t('session.empty')}</Text>
        </View>
      )}
      <ExitCorner onLongPress={() => phase === 'running' && setPhase('paused')} />
      {phase === 'paused' && <PauseOverlay onResume={() => setPhase('running')} onExit={() => finish(false)} />}
      {portrait && <RotateHint />}
    </View>
  );
}

function FadeIn({ children, style }: { children: React.ReactNode; style: object }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: CROSSFADE_MS, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

/** FR-29: a short, joyful end card. No score. */
function EndCard() {
  const [scale] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
  }, [scale]);
  return (
    <View style={[styles.root, styles.stage]}>
      <StatusBar hidden />
      <Animated.Text style={{ fontSize: 180, transform: [{ scale }] }}>🌟</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  stage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 16 },
  image: { flex: 1, width: '100%' },
  nameStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  name: { color: NAME_RED, fontWeight: '800', textAlign: 'center' },
  caption: { position: 'absolute', right: 16, bottom: 10, maxWidth: '45%', fontSize: 13, color: CAPTION_GREY, textAlign: 'right' },
});
