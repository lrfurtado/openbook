import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CardThumb } from '@/components/CardImage';
import { formatBytes, Row, Screen, Section } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { createDeck, listDecks, listPacks, listUserCards } from '@/lib/repo';

/** Downloaded packs, custom decks and the parent's own cards. */
export default function Library() {
  const { t } = useTranslation();
  const q = useLiveQuery(
    async () => ({ packs: await listPacks(), decks: await listDecks(), cards: await listUserCards() }),
    ['pack', 'deck', 'card'],
    [],
  );
  const data = q.data;
  return (
    <Screen>
      <Stack.Screen options={{ title: t('library.title') }} />
      <Section title={t('library.packs')}>
        {data?.packs.map((p) => (
          <Row
            key={p.id}
            title={p.title.en}
            subtitle={`${t('library.cards', { count: p.cardIds.length })} · ${formatBytes(p.bytes)}${p.status === 'complete' ? '' : ` · ${t('library.incomplete')}`}`}
            onPress={() => router.push(`/library/pack/${p.id}`)}
          />
        ))}
        <Row title={`＋ ${t('library.getPacks')}`} onPress={() => router.push('/catalog')} last />
      </Section>
      <Section title={t('library.decks')}>
        {data?.decks.map((d) => (
          <Row key={d.id} title={d.title} subtitle={t('library.cards', { count: d.cardIds.length })} onPress={() => router.push(`/library/deck/${d.id}`)} />
        ))}
        <Row
          title={`＋ ${t('library.newDeck')}`}
          last
          onPress={async () => {
            const deck = await createDeck(t('library.untitledDeck'));
            router.push(`/library/deck/${deck.id}`);
          }}
        />
      </Section>
      <Section title={t('library.myCards')}>
        {data?.cards.map((c) => (
          <Row key={c.id} title={c.name.en} left={<CardThumb card={c} size={44} />} onPress={() => router.push(`/library/card/${c.id}`)} />
        ))}
        <Row title={`＋ ${t('library.newCard')}`} onPress={() => router.push('/library/card/new')} last />
      </Section>
    </Screen>
  );
}
