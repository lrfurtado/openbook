import type { BookLayout } from '@openbook/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Body, Button, Loading, Screen, Segmented, Title } from '@/components/ui';
import { printBook, type Paper } from '@/features/print';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { getBook } from '@/lib/repo';

/** FR-76: print or save as PDF, landscape A4 / Letter. */
export default function PrintBook() {
  const { t } = useTranslation();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const q = useLiveQuery(() => getBook(bookId), ['book'], [bookId]);
  const [paper, setPaper] = useState<Paper>('a4');
  const [layout, setLayout] = useState<BookLayout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!q.data) return <Loading />;
  const book = q.data;
  return (
    <Screen>
      <Stack.Screen options={{ title: t('books.print') }} />
      <Title>{book.title.en}</Title>
      <Body muted>{t('print.help')}</Body>
      <Segmented value={paper} onChange={setPaper} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} />
      <Segmented
        value={layout ?? book.layout}
        onChange={setLayout}
        options={[
          { value: 'text-then-picture', label: t('settings.layoutTextThenPicture') },
          { value: 'text-only', label: t('settings.layoutTextOnly') },
          { value: 'side-by-side', label: t('settings.layoutSideBySide') },
        ]}
      />
      {!!error && <Body>{error}</Body>}
      <Button
        title={t('print.button')}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await printBook(book, layout ?? book.layout, paper);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Screen>
  );
}
