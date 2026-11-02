import type { BookStage, BookSummary } from '@openbook/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { PackList } from '@/components/PackList';
import { useTheme } from '@/components/theme';
import { Button, Empty, Loading, Row, Screen, Section, Segmented } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { listBooks } from '@/lib/repo';
import { useBooksQuery } from '@/store/api';

function BookCatalog() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useBooksQuery();
  const local = useLiveQuery(listBooks, ['book'], []);
  const [stage, setStage] = useState<0 | BookStage>(0);
  if (isLoading) return <Loading />;
  if (isError || !data) {
    return <Empty title={t('catalog.offlineTitle')} body={t('catalog.offlineBody')} action={<Button variant="secondary" title={t('common.retry')} onPress={refetch} />} />;
  }
  const groups = new Map<string, BookSummary[]>();
  const items = data.items.filter((b) => !stage || b.stage === stage).sort((a, b) => a.stage - b.stage);
  for (const b of items) groups.set(b.categorySlug ?? 'other', [...(groups.get(b.categorySlug ?? 'other') ?? []), b]);
  return (
    <>
      <Segmented
        value={stage}
        onChange={setStage}
        options={[{ value: 0 as const, label: t('catalog.allStages') }, ...([1, 2, 3, 4] as const).map((s) => ({ value: s, label: t('catalog.stage', { stage: s }) }))]}
      />
      {!groups.size && <Empty title={t('catalog.noBooks')} />}
      {[...groups].map(([slug, books]) => (
        <Section key={slug} title={t(`categories.${slug}`, { defaultValue: slug })}>
          {books.map((b, i) => {
            const mine = local.data?.find((l) => l.id === b.id);
            return (
              <Row
                key={b.id}
                last={i === books.length - 1}
                title={b.title.en}
                subtitle={t('catalog.bookMeta', { stage: b.stage, count: b.pageCount })}
                left={<Image source={b.coverUrl ? { uri: b.coverUrl } : undefined} style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: '#ddd' }} />}
                right={mine ? <Text style={{ color: theme.success, fontWeight: '700' }}>✓</Text> : undefined}
                onPress={() => router.push(`/catalog/books/${b.id}`)}
              />
            );
          })}
        </Section>
      ))}
    </>
  );
}

/** FR-1 / FR-60: packs and official books from the API, grouped by category. */
export default function Catalog() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'packs' | 'books'>(params.tab === 'books' ? 'books' : 'packs');
  return (
    <Screen>
      <Stack.Screen options={{ title: t('catalog.title') }} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'packs', label: t('catalog.packs') },
          { value: 'books', label: t('catalog.books') },
        ]}
      />
      {tab === 'packs' ? <PackList onOpen={(p) => router.push(`/catalog/${p.id}`)} /> : <BookCatalog />}
    </Screen>
  );
}
