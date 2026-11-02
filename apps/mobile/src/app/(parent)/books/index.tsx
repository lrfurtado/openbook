import type { Book } from '@openbook/shared';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BookCover } from '@/components/BookThumbs';
import { Row, Screen, Section } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { listActiveBooks, listBooks, listChildren } from '@/lib/repo';

async function load() {
  const books = (await listBooks()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const reading = new Map<string, string[]>();
  for (const child of await listChildren()) {
    for (const ab of await listActiveBooks(child.id)) {
      if (ab.status === 'active') reading.set(ab.bookId, [...(reading.get(ab.bookId) ?? []), child.nickname]);
    }
  }
  return { books, reading };
}

/** My books: homemade, generated and downloaded official books. */
export default function Books() {
  const { t } = useTranslation();
  const q = useLiveQuery(load, ['book', 'activeBook', 'child'], []);
  const books = q.data?.books ?? [];
  const mine = books.filter((b) => b.source !== 'official');
  const official = books.filter((b) => b.source === 'official');
  const row = (b: Book) => {
    const readers = q.data?.reading.get(b.id);
    const meta = t('books.meta', { stage: b.stage, count: b.pages.length, source: t(`books.source.${b.source}`) });
    return (
      <Row
        key={b.id}
        title={b.title.en}
        subtitle={readers ? `${meta}\n${t('books.readBy', { names: readers.join(', ') })}` : meta}
        left={<BookCover book={b} width={64} height={48} />}
        onPress={() => router.push(`/books/${b.id}`)}
      />
    );
  };
  return (
    <Screen>
      <Stack.Screen options={{ title: t('books.title') }} />
      <Section title={t('books.mine')}>
        {mine.map(row)}
        <Row title={`＋ ${t('books.new')}`} subtitle={mine.length ? undefined : t('books.newHint')} onPress={() => router.push('/books/new')} last />
      </Section>
      <Section title={t('books.official')}>
        {official.map(row)}
        <Row title={`＋ ${t('books.getOfficial')}`} onPress={() => router.push({ pathname: '/catalog', params: { tab: 'books' } })} last />
      </Section>
    </Screen>
  );
}
