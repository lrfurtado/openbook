import { skipToken } from '@reduxjs/toolkit/query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';
import { BookCover, BookReadiness, PageStrip } from '@/components/BookThumbs';
import { useTheme } from '@/components/theme';
import { Body, Button, Loading, ProgressBar, Screen, Section, Title, formatBytes } from '@/components/ui';
import { startBookDownload } from '@/features/downloads';
import { PREVIEW_CHILD } from '@/features/reader';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { confirm } from '@/lib/confirm';
import { deleteBook, getBook } from '@/lib/repo';
import { useAppDispatch, useAppSelector } from '@/store';
import { useBookManifestQuery, useBookQuery } from '@/store/api';

/** FR-60: official book detail — cover, page preview, readiness and credits before download; offline afterwards. */
export default function CatalogBook() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const dispatch = useAppDispatch();
  const remote = useBookQuery(bookId);
  const manifest = useBookManifestQuery(remote.data ? { id: bookId, version: remote.data.version } : skipToken);
  const local = useLiveQuery(() => getBook(bookId), ['book'], [bookId]);
  const dl = useAppSelector((s) => s.downloads[bookId]);
  if (remote.isLoading || local.loading) return <Loading />;
  const summary = remote.data;
  const mine = local.data;
  // The downloaded copy reads offline; the manifest previews what an update would bring.
  const book = mine && (!summary || mine.version >= summary.version) ? mine : (manifest.data?.data ?? mine);
  const busy = dl?.status === 'downloading';
  const credits = book?.pages.filter((p) => p.image?.attribution) ?? [];

  return (
    <Screen>
      <Stack.Screen options={{ title: summary?.title.en ?? mine?.title.en }} />
      {book && (
        <View style={{ alignItems: 'center' }}>
          <BookCover book={book} width={320} height={220} radius={16} />
        </View>
      )}
      <Title>{summary?.title.en ?? mine?.title.en}</Title>
      {summary && (
        <Body muted>
          {t('catalog.bookMeta', { stage: summary.stage, count: summary.pageCount })}
          {summary.downloadBytes ? ` · ${formatBytes(summary.downloadBytes)}` : ''}
        </Body>
      )}
      {busy && <ProgressBar value={dl.total ? dl.done / dl.total : 0} label={t('catalog.downloading')} />}
      {dl?.status === 'error' && <Body>{t('catalog.failed', { error: dl.error })}</Body>}
      {summary && (!mine || mine.version < summary.version) && (
        <Button loading={busy} title={t(mine ? 'catalog.updateTo' : 'catalog.download', { version: summary.version })} onPress={() => startBookDownload(dispatch, summary)} />
      )}
      {mine && (
        <>
          <Body>✓ {t('catalog.bookDownloaded')}</Body>
          <Button title={t('books.preview')} onPress={() => router.push({ pathname: '/[childId]/read/[bookId]', params: { childId: PREVIEW_CHILD, bookId } })} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" title={t('books.addToChild')} onPress={() => router.push(`/books/${bookId}/assign`)} />
            <Button variant="secondary" title={t('books.details')} onPress={() => router.push(`/books/${bookId}`)} />
          </View>
        </>
      )}
      {!summary && !mine && <Body>{t('catalog.offlineBody')}</Body>}

      {book && (
        <Section title={t('books.pages')}>
          <View style={{ padding: 12 }}>
            <PageStrip book={book} />
          </View>
        </Section>
      )}
      {!book && manifest.isFetching && <Loading />}
      {book && <BookReadiness vocabulary={book.vocabulary} bookId={mine ? bookId : undefined} />}

      {!!credits.length && (
        <Section title={t('books.pictureCredits')}>
          <View style={{ padding: 12, gap: 6 }}>
            {credits.map((p) => (
              <Text key={p.id} style={{ color: theme.muted, fontSize: 13 }} onPress={() => Linking.openURL(p.image!.attribution!.sourceUrl)}>
                {`${p.text.en ?? ''} — ${p.image!.attribution!.author}, ${p.image!.attribution!.license}`}
              </Text>
            ))}
          </View>
        </Section>
      )}

      {mine && (
        <Button
          variant="danger"
          title={t('catalog.removeBook')}
          onPress={() => confirm(t('books.deleteTitle'), t('books.deleteBody'), () => deleteBook(bookId), t('common.delete'), t('common.cancel'))}
        />
      )}
    </Screen>
  );
}
