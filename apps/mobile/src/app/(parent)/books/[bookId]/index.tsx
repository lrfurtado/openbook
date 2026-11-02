import { validateBook } from '@openbook/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BookCover, BookReadiness, PageStrip } from '@/components/BookThumbs';
import { Body, Button, Loading, Notice, Row, Screen, Section, Title } from '@/components/ui';
import { PREVIEW_CHILD } from '@/features/reader';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { confirm } from '@/lib/confirm';
import { copyBook, deleteBook, getBook, listActiveBooks, listChildren } from '@/lib/repo';
import { goBack } from '@/lib/nav';

async function load(bookId: string) {
  const book = await getBook(bookId);
  const readers = [];
  for (const child of await listChildren()) {
    const entry = (await listActiveBooks(child.id)).filter((ab) => ab.bookId === bookId).sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0))[0];
    if (entry) readers.push({ child, status: entry.status });
  }
  return { book, readers };
}

/** Book detail: cover, page preview, who reads it, readiness per child (FR-75), preview, edit, print, copy. */
export default function BookDetail() {
  const { t } = useTranslation();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const q = useLiveQuery(() => load(bookId), ['book', 'activeBook', 'child'], [bookId]);
  if (!q.data) return <Loading />;
  const { book, readers } = q.data;
  if (!book) return <Screen><Body>{t('common.notFound')}</Body></Screen>;
  const issues = validateBook(book);

  const makeCopy = async () => {
    const copy = await copyBook(book, t('books.copyTitle', { title: book.title.en }));
    router.push(`/books/${copy.id}/edit`);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: book.title.en }} />
      <View style={{ alignItems: 'center' }}>
        <BookCover book={book} width={320} height={220} radius={16} />
      </View>
      <Title>{book.title.en}</Title>
      <Body muted>
        {t('books.meta', { stage: book.stage, count: book.pages.length, source: t(`books.source.${book.source}`) })}
        {' · '}
        {t('books.vocabulary', { count: book.vocabulary.length })}
      </Body>
      {!!issues.length && <Notice>{t('books.hasIssues', { count: issues.length })}</Notice>}
      <Button title={t('books.preview')} onPress={() => router.push({ pathname: '/[childId]/read/[bookId]', params: { childId: PREVIEW_CHILD, bookId } })} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="secondary" title={t('books.addToChild')} onPress={() => router.push(`/books/${bookId}/assign`)} />
        {book.source === 'official' ? (
          <Button variant="secondary" title={t('books.copy')} onPress={makeCopy} />
        ) : (
          <Button variant="secondary" title={t('books.edit')} onPress={() => router.push(`/books/${bookId}/edit`)} />
        )}
        <Button variant="secondary" title={t('books.print')} onPress={() => router.push(`/books/${bookId}/print`)} />
      </View>

      <Section title={t('books.pages')}>
        <View style={{ padding: 12 }}>
          <PageStrip book={book} />
        </View>
      </Section>

      {!!readers.length && (
        <Section title={t('books.readers')}>
          {readers.map(({ child, status }, i) => (
            <Row
              key={child.id}
              last={i === readers.length - 1}
              title={`${child.avatar} ${child.nickname}`}
              subtitle={status === 'active' ? t('books.readingNow') : t('program.onShelf')}
              onPress={() => router.push(`/children/${child.id}`)}
            />
          ))}
        </Section>
      )}

      <BookReadiness vocabulary={book.vocabulary} bookId={book.id} />

      <Button
        variant="danger"
        title={t('books.delete')}
        onPress={() =>
          confirm(t('books.deleteTitle'), t('books.deleteBody'), async () => {
            await deleteBook(book.id);
            goBack('/books');
          }, t('common.delete'), t('common.cancel'))
        }
      />
    </Screen>
  );
}
