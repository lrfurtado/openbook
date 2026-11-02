import type { Attribution } from '@openbook/shared';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';
import { Body, Row, Screen, Section } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { getCards, listBooks, listPacks } from '@/lib/repo';

async function load() {
  const groups: { id: string; title: string; items: { name: string; a: Attribution }[] }[] = [];
  for (const p of await listPacks()) {
    const cards = await getCards(p.cardIds);
    groups.push({ id: p.id, title: p.title.en, items: cards.filter((c) => c.attribution).map((c) => ({ name: c.name.en, a: c.attribution! })) });
  }
  for (const b of await listBooks()) {
    const items = b.pages.filter((pg) => pg.image?.attribution).map((pg) => ({ name: pg.text.en ?? '', a: pg.image!.attribution! }));
    if (items.length) groups.push({ id: b.id, title: b.title.en, items });
  }
  return groups;
}

/** FR-13 / AC-8: every official image with its author, license and source. */
export default function Credits() {
  const { t } = useTranslation();
  const q = useLiveQuery(load, ['pack', 'card', 'book'], []);
  return (
    <Screen>
      <Stack.Screen options={{ title: t('parent.credits') }} />
      <Body muted>{t('credits.intro')}</Body>
      {q.data?.map((g) => (
        <Section key={g.id} title={g.title}>
          {g.items.map(({ name, a }, i) => (
            <Row
              key={`${name}-${i}`}
              last={i === g.items.length - 1}
              title={name}
              subtitle={`${a.author} · ${a.license}`}
              accessibilityLabel={t('credits.openSource', { name })}
              onPress={() => Linking.openURL(a.sourceUrl)}
            />
          ))}
        </Section>
      ))}
      {!q.data?.length && <Body muted>{t('credits.empty')}</Body>}
    </Screen>
  );
}
