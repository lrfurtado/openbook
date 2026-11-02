import type { Card } from '@openbook/shared';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { getCards, listPacks, listUserCards } from '@/lib/repo';
import { CardThumb } from './CardImage';
import { useTheme } from './theme';
import { Row, Section } from './ui';

async function loadGroups() {
  const groups: { title: string; cards: Card[] }[] = [];
  const mine = await listUserCards();
  if (mine.length) groups.push({ title: '', cards: mine });
  for (const p of await listPacks()) groups.push({ title: p.title.en, cards: await getCards(p.cardIds) });
  return groups;
}

/** Multi-select over own cards and downloaded official cards (FR-10). */
export function CardPicker({ selected, onToggle, exclude }: { selected: ReadonlySet<string>; onToggle: (id: string) => void; exclude?: ReadonlySet<string> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const q = useLiveQuery(loadGroups, ['card', 'pack'], []);
  return (
    <>
      {q.data?.map((g) => {
        const cards = g.cards.filter((c) => !exclude?.has(c.id));
        if (!cards.length) return null;
        return (
          <Section key={g.title || 'mine'} title={g.title || t('library.myCards')}>
            {cards.map((c, i) => {
              const on = selected.has(c.id);
              return (
                <Row
                  key={c.id}
                  last={i === cards.length - 1}
                  title={c.name.en}
                  left={<CardThumb card={c} size={40} />}
                  right={<Text style={{ fontSize: 22, color: on ? theme.primary : theme.muted }}>{on ? '☑' : '☐'}</Text>}
                  accessibilityLabel={`${c.name.en}${on ? `, ${t('common.selected')}` : ''}`}
                  onPress={() => onToggle(c.id)}
                />
              );
            })}
          </Section>
        );
      })}
    </>
  );
}
