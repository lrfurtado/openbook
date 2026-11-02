import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PackList } from '@/components/PackList';
import { Body, Button, Screen, Title } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { addSet, listChildren, listPacks } from '@/lib/repo';
import { useAppDispatch } from '@/store';
import { appActions } from '@/store/appSlice';

/** FR-7: no bundled decks — the parent downloads at least one pack, which becomes the first set. */
export default function FirstPack() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const packs = useLiveQuery(listPacks, ['pack'], []);
  const ready = packs.data?.filter((p) => p.status === 'complete') ?? [];

  const finish = async () => {
    const children = await listChildren();
    for (const child of children) {
      for (const p of ready.slice(0, child.settings.maxActiveSets)) await addSet(child, 'pack', p.id);
    }
    dispatch(appActions.completeOnboarding());
    router.replace('/profiles');
  };

  return (
    <Screen>
      <Title>{t('onboarding.packTitle')}</Title>
      <Body muted>{t('onboarding.packBody')}</Body>
      <PackList />
      <Button title={t('onboarding.finish', { count: ready.length })} disabled={!ready.length} onPress={finish} />
    </Screen>
  );
}
