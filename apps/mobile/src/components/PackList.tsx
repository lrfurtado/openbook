import type { PackSummary } from '@openbook/shared';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { startPackDownload } from '@/features/downloads';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { listPacks } from '@/lib/repo';
import { useAppDispatch, useAppSelector } from '@/store';
import { usePacksQuery } from '@/store/api';
import { useTheme } from './theme';
import { Button, Empty, formatBytes, Loading, ProgressBar, Row, Section } from './ui';

/** Catalog packs grouped by category, with download / update state (FR-1..4). */
export function PackList({ onOpen }: { onOpen?: (pack: PackSummary) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const downloads = useAppSelector((s) => s.downloads);
  const { data, isLoading, isError, refetch } = usePacksQuery();
  const local = useLiveQuery(listPacks, ['pack'], []);

  if (isLoading) return <Loading />;
  if (isError || !data) {
    return (
      <Empty
        title={t('catalog.offlineTitle')}
        body={t('catalog.offlineBody')}
        action={<Button variant="secondary" title={t('common.retry')} onPress={refetch} />}
      />
    );
  }

  const groups = new Map<string, PackSummary[]>();
  for (const p of data.items) groups.set(p.categorySlug, [...(groups.get(p.categorySlug) ?? []), p]);

  return (
    <>
      {[...groups].map(([slug, packs]) => (
        <Section key={slug} title={t(`categories.${slug}`, { defaultValue: slug })}>
          {packs.map((p, i) => {
            const mine = local.data?.find((l) => l.id === p.id);
            const dl = downloads[p.id];
            const busy = dl?.status === 'downloading';
            const state = !mine
              ? 'none'
              : mine.status !== 'complete'
                ? 'partial'
                : mine.version < p.version
                  ? 'update'
                  : 'installed';
            return (
              <View key={p.id}>
                <Row
                  last={i === packs.length - 1 && !busy && dl?.status !== 'error'}
                  title={p.title.en}
                  subtitle={t('catalog.packMeta', { count: p.cardCount, size: formatBytes(p.downloadBytes) })}
                  onPress={onOpen ? () => onOpen(p) : undefined}
                  left={<Image source={{ uri: p.coverUrl }} style={styles.cover} contentFit="cover" accessibilityIgnoresInvertColors />}
                  right={
                    state === 'installed' ? (
                      <Text style={{ color: theme.success, fontWeight: '700' }}>✓ {t('catalog.downloaded')}</Text>
                    ) : (
                      <Button
                        title={t(state === 'update' ? 'catalog.update' : state === 'partial' ? 'catalog.resume' : 'catalog.download')}
                        loading={busy}
                        onPress={() => startPackDownload(dispatch, p)}
                        style={{ minHeight: 40 }}
                      />
                    )
                  }
                />
                {busy && (
                  <View style={styles.progress}>
                    <ProgressBar value={dl.total ? dl.done / dl.total : 0} label={t('catalog.downloading')} />
                    <Text style={{ color: theme.muted, fontSize: 12 }}>{t('catalog.progress', { done: dl.done, total: dl.total })}</Text>
                  </View>
                )}
                {dl?.status === 'error' && (
                  <Text style={[styles.progress, { color: theme.danger }]}>{t('catalog.failed', { error: dl.error })}</Text>
                )}
              </View>
            );
          })}
        </Section>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  cover: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#ddd' },
  progress: { paddingHorizontal: 16, paddingBottom: 12, gap: 4 },
});
