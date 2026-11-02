import type { Book } from '@openbook/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookCover } from '@/components/BookThumbs';
import { child as c } from '@/components/theme';
import { enterFullscreen } from '@/hooks/useImmersive';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { getBook, listActiveBooks } from '@/lib/repo';
import { goBack } from '@/lib/nav';

async function loadShelf(childId: string) {
  const entries = await listActiveBooks(childId);
  const rows = await Promise.all(entries.map(async (ab) => ({ ab, book: await getBook(ab.bookId) })));
  const withBooks = rows.filter((r): r is typeof r & { book: Book } => !!r.book);
  return {
    active: withBooks.filter((r) => r.ab.status === 'active'),
    // A book retired more than once shows once.
    retired: [...new Map(withBooks.filter((r) => r.ab.status === 'retired').map((r) => [r.book.id, r])).values()],
  };
}

/** FR-71: active books plus the child's retired Bookshelf, which can always be reread. */
export default function Bookshelf() {
  const { t } = useTranslation();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const q = useLiveQuery(() => loadShelf(childId), ['activeBook', 'book'], [childId]);

  const open = (bookId: string, activeBookId?: string) => {
    enterFullscreen();
    router.push({ pathname: '/[childId]/read/[bookId]', params: { childId, bookId, ...(activeBookId ? { activeBookId } : {}) } });
  };

  const cover = (book: Book, onPress: () => void) => {
    return (
      <Pressable key={book.id} accessibilityRole="button" accessibilityLabel={book.title.en} onPress={onPress} style={styles.book}>
        <BookCover book={book} width={180} height={130} radius={16} />
        <Text style={styles.bookTitle} numberOfLines={2}>
          {book.title.en}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('today.back')} onPress={() => goBack(`/${childId}/today`)} style={styles.backBtn}>
          <Text style={{ fontSize: 44 }}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          📚 {t('bookshelf.title')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {!!q.data?.active.length && <Text style={styles.heading}>{t('bookshelf.reading')}</Text>}
        <View style={styles.row}>{q.data?.active.map((r) => cover(r.book, () => open(r.book.id, r.ab.id)))}</View>
        {!!q.data?.retired.length && <Text style={styles.heading}>{t('bookshelf.shelf')}</Text>}
        <View style={styles.row}>{q.data?.retired.map((r) => cover(r.book, () => open(r.book.id)))}</View>
        {q.data && !q.data.active.length && !q.data.retired.length && <Text style={styles.empty}>{t('bookshelf.empty')}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  backBtn: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '900', color: c.text },
  list: { padding: 16, gap: 12 },
  heading: { fontSize: 20, fontWeight: '800', color: '#666' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  book: { width: 180, gap: 8 },
  bookTitle: { fontSize: 18, fontWeight: '800', color: c.text },
  empty: { fontSize: 20, color: '#666', textAlign: 'center', marginTop: 48 },
});
