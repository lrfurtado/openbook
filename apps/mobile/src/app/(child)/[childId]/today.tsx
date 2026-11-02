import { bookTodayStatus, localDate, setTodayStatus, type ActiveBook, type ActiveSet, type Book, type Card } from '@openbook/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CardThumb, MediaImage } from '@/components/CardImage';
import { child as c } from '@/components/theme';
import { Loading } from '@/components/ui';
import { enterFullscreen } from '@/hooks/useImmersive';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { getBook, getCards, getChild, listActiveBooks, listLogs, listSets, sourceTitle } from '@/lib/repo';
import { goBack } from '@/lib/nav';

async function loadToday(childId: string) {
  const child = await getChild(childId);
  if (!child) return null;
  const [sets, logs, activeBooks] = await Promise.all([listSets(childId), listLogs(childId), listActiveBooks(childId)]);
  const active = sets.filter((s) => s.status === 'active');
  const setRows = await Promise.all(
    active.map(async (set) => ({
      set,
      title: await sourceTitle(set.sourceType, set.sourceId),
      cover: (await getCards(set.cardIds.slice(0, 1)))[0] as Card | undefined,
    })),
  );
  const bookRows = (
    await Promise.all(
      activeBooks.filter((b) => b.status === 'active').map(async (ab) => ({ ab, book: await getBook(ab.bookId) })),
    )
  ).filter((r): r is { ab: ActiveBook; book: Book } => !!r.book);
  return { child, logs, setRows, bookRows };
}

function Dots({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <View style={styles.dots} accessible accessibilityLabel={label}>
      {Array.from({ length: Math.max(total, done) }, (_, i) => (
        <View key={i} style={[styles.dot, i < done ? styles.dotDone : styles.dotTodo]}>
          {i < done && <Text style={styles.dotCheck}>✓</Text>}
        </View>
      ))}
    </View>
  );
}

/** FR-35 / FR-72: today's sessions and readings. The schedule guides; any session can start any time. */
export default function Today() {
  const { t } = useTranslation();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const q = useLiveQuery(() => loadToday(childId), ['child', 'set', 'log', 'activeBook', 'book', 'pack', 'deck'], [childId]);
  if (!q.data) return <Loading />;
  const { child, logs, setRows, bookRows } = q.data;
  const today = localDate();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('today.back')} onPress={() => goBack('/profiles')} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.avatar}>{child.avatar}</Text>
        <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>
          {t('today.title', { name: child.nickname })}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/${childId}/bookshelf`)} style={styles.shelfBtn}>
          <Text style={styles.shelfText}>📚 {t('today.bookshelf')}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {child.chooseNewSource && <Text style={styles.notice}>🌟 {t('today.chooseNewPack')}</Text>}
        {!setRows.length && !bookRows.length && <Text style={styles.empty}>{t('today.empty')}</Text>}
        {setRows.map(({ set, title, cover }) => {
          const st = setTodayStatus(set as ActiveSet, logs, child.settings, today);
          return (
            <View key={set.id} style={styles.tile}>
              {cover ? <CardThumb card={cover} size={96} /> : <View style={styles.placeholder} />}
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.tileTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Dots done={st.done} total={child.settings.sessionsPerDay} label={t('today.sessionsLabel', { done: st.done, total: child.settings.sessionsPerDay })} />
                <Text style={styles.meta}>{t('today.dayOf', { day: Math.min(st.activeDayCount + (st.done ? 0 : 1), st.targetDays), total: st.targetDays })}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('today.startLabel', { title })}
                onPress={() => {
                  enterFullscreen();
                  router.push(`/${childId}/session/${set.id}`);
                }}
                style={({ pressed }) => [styles.start, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.startText}>▶</Text>
              </Pressable>
            </View>
          );
        })}
        {bookRows.map(({ ab, book }) => {
          const st = bookTodayStatus(ab, logs, child.settings, today);
          const firstImage = book.pages.find((p) => p.image)?.image;
          return (
            <View key={ab.id} style={styles.tile}>
              <MediaImage mediaKey={firstImage?.localPath} style={styles.bookCover} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.tileTitle} numberOfLines={1}>
                  📖 {book.title.en}
                </Text>
                <Dots done={st.done} total={child.settings.readingsPerDay} label={t('today.readingsLabel', { done: st.done, total: child.settings.readingsPerDay })} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('today.readLabel', { title: book.title.en })}
                onPress={() => {
                  enterFullscreen();
                  router.push({ pathname: '/[childId]/read/[bookId]', params: { childId, bookId: book.id, activeBookId: ab.id } });
                }}
                style={({ pressed }) => [styles.start, styles.read, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.startText}>▶</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  headerBtn: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  headerBtnText: { fontSize: 44, color: c.text },
  avatar: { fontSize: 44 },
  title: { flex: 1, fontSize: 28, fontWeight: '900', color: c.text },
  shelfBtn: { backgroundColor: c.card, borderRadius: 32, paddingHorizontal: 20, minHeight: 64, justifyContent: 'center' },
  shelfText: { fontSize: 20, fontWeight: '800', color: c.text },
  list: { padding: 16, gap: 16, maxWidth: 900, width: '100%', alignSelf: 'center' },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: c.card, borderRadius: 24, padding: 14 },
  placeholder: { width: 96, height: 96, borderRadius: 8, backgroundColor: '#eee' },
  bookCover: { width: 96, height: 96, borderRadius: 8, backgroundColor: '#FFE9E9' },
  tileTitle: { fontSize: 22, fontWeight: '800', color: c.text },
  meta: { fontSize: 14, color: '#6b6b6b' },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: c.done },
  dotTodo: { borderWidth: 3, borderColor: c.todo },
  dotCheck: { color: '#fff', fontWeight: '900', fontSize: 14 },
  start: { width: 88, height: 88, borderRadius: 44, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  read: { backgroundColor: '#1F6FB2' },
  startText: { color: '#fff', fontSize: 36, marginLeft: 6 },
  notice: { fontSize: 18, color: c.text, backgroundColor: '#FFF1C2', padding: 16, borderRadius: 16 },
  empty: { fontSize: 20, color: '#666', textAlign: 'center', marginTop: 48 },
});
