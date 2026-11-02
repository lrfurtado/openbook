import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CardThumb } from '@/components/CardImage';
import { Button, Loading, Row, Screen, Section } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { getCards, getPack } from '@/lib/repo';

/** The cards of a downloaded pack; each opens its info / attribution screen (FR-13). */
export default function LocalPack() {
  const { t } = useTranslation();
  const { packId } = useLocalSearchParams<{ packId: string }>();
  const q = useLiveQuery(
    async () => {
      const pack = await getPack(packId);
      return { pack, cards: pack ? await getCards(pack.cardIds) : [] };
    },
    ['pack', 'card'],
    [packId],
  );
  if (!q.data) return <Loading />;
  return (
    <Screen>
      <Stack.Screen options={{ title: q.data.pack?.title.en ?? '' }} />
      <Button variant="secondary" title={t('library.managePack')} onPress={() => router.push(`/catalog/${packId}`)} />
      <Section>
        {q.data.cards.map((c, i) => (
          <Row
            key={c.id}
            last={i === q.data!.cards.length - 1}
            title={c.name.en}
            subtitle={c.attribution ? `${c.attribution.author} · ${c.attribution.license}` : undefined}
            left={<CardThumb card={c} size={44} />}
            onPress={() => router.push(`/library/card/${c.id}`)}
          />
        ))}
      </Section>
    </Screen>
  );
}
