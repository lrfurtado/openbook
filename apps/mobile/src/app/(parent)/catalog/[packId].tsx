import { pickRendition } from '@openbook/shared';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Body, Button, formatBytes, Loading, ProgressBar, Screen, Section, Title } from '@/components/ui';
import { startPackDownload } from '@/features/downloads';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { confirm } from '@/lib/confirm';
import { getPack, removePack } from '@/lib/repo';
import { useAppDispatch, useAppSelector } from '@/store';
import { catalogApi, usePackQuery } from '@/store/api';

/** FR-2..5: pack detail with preview, download / update / remove and storage used. */
export default function PackDetail() {
  const { t } = useTranslation();
  const { packId } = useLocalSearchParams<{ packId: string }>();
  const dispatch = useAppDispatch();
  const remote = usePackQuery(packId);
  const manifest = catalogApi.usePackManifestQuery(remote.data ? { id: packId, version: remote.data.version } : (undefined as never), { skip: !remote.data });
  const local = useLiveQuery(() => getPack(packId), ['pack'], [packId]);
  const dl = useAppSelector((s) => s.downloads[packId]);

  if (remote.isLoading || local.loading) return <Loading />;
  const summary = remote.data;
  const mine = local.data;
  const title = summary?.title.en ?? mine?.title.en ?? '';
  const busy = dl?.status === 'downloading';

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <Title>{title}</Title>
      <Body muted>{summary?.description.en ?? mine?.description.en}</Body>
      {summary && <Body>{t('catalog.packMeta', { count: summary.cardCount, size: formatBytes(summary.downloadBytes) })} · v{summary.version}</Body>}
      {mine && <Body>{t('catalog.storageUsed', { size: formatBytes(mine.bytes), version: mine.version })}</Body>}
      {busy && <ProgressBar value={dl.total ? dl.done / dl.total : 0} label={t('catalog.downloading')} />}
      {dl?.status === 'error' && <Body>{t('catalog.failed', { error: dl.error })}</Body>}
      {summary && (!mine || mine.status !== 'complete' || mine.version < summary.version) && (
        <Button
          loading={busy}
          title={t(!mine ? 'catalog.download' : mine.status !== 'complete' ? 'catalog.resume' : 'catalog.updateTo', { version: summary.version })}
          onPress={() => startPackDownload(dispatch, summary)}
        />
      )}
      {mine && (
        <Button
          variant="danger"
          title={t('catalog.remove')}
          onPress={() => confirm(t('catalog.removeTitle'), t('catalog.removeBody'), () => removePack(packId), t('catalog.remove'), t('common.cancel'))}
        />
      )}
      {!summary && !mine && <Body>{t('catalog.offlineBody')}</Body>}
      {summary && <Body muted>{summary.attributionSummary}</Body>}
      {manifest.data && (
        <Section title={t('catalog.preview')}>
          <View style={styles.grid}>
            {manifest.data.cards.map((c) => (
              <Image
                key={c.id}
                source={{ uri: pickRendition(c.image.renditions, 400)?.url }}
                style={styles.thumb}
                contentFit="cover"
                accessibilityLabel={c.name.en}
              />
            ))}
          </View>
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 8 },
  thumb: { width: 96, height: 72, borderRadius: 6, backgroundColor: '#ddd' },
});
