import type { CustomDeck } from '@openbook/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { CardThumb } from '@/components/CardImage';
import { CardPicker } from '@/components/CardPicker';
import { useTheme } from '@/components/theme';
import { Body, Button, DraftField, Loading, Row, Screen, Section } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { confirm } from '@/lib/confirm';
import { deleteDeck, getCards, getDeck, saveDeck } from '@/lib/repo';
import { goBack } from '@/lib/nav';

/** FR-10: create, edit, reorder and delete custom decks mixing own and official cards. */
export default function DeckEditor() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const q = useLiveQuery(
    async () => {
      const deck = await getDeck(deckId);
      return { deck, cards: deck ? await getCards(deck.cardIds) : [] };
    },
    ['deck', 'card'],
    [deckId],
  );
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (!q.data) return <Loading />;
  const { deck, cards } = q.data;
  if (!deck) return <Screen><Body>{t('common.notFound')}</Body></Screen>;

  const update = (patch: Partial<CustomDeck>) => saveDeck({ ...deck, ...patch });
  const move = (i: number, d: -1 | 1) => {
    const ids = deck.cardIds.slice();
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    update({ cardIds: ids });
  };
  const iconBtn = (label: string, glyph: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ padding: 8, minWidth: 36, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, color: theme.text }}>{glyph}</Text>
    </Pressable>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: deck.title }} />
      <DraftField key={deck.id} label={t('deck.title')} initial={deck.title} onCommit={(v) => (v.trim() ? void update({ title: v.trim() }) : deck.title)} />
      <Section title={t('library.cards', { count: cards.length })}>
        {cards.map((c, i) => (
          <Row
            key={c.id}
            title={c.name.en}
            left={<CardThumb card={c} size={40} />}
            last={i === cards.length - 1}
            right={
              <View style={{ flexDirection: 'row' }}>
                {iconBtn(t('deck.moveUp', { name: c.name.en }), '↑', () => move(i, -1))}
                {iconBtn(t('deck.moveDown', { name: c.name.en }), '↓', () => move(i, 1))}
                {iconBtn(t('deck.remove', { name: c.name.en }), '✕', () => update({ cardIds: deck.cardIds.filter((id) => id !== c.id) }))}
              </View>
            }
          />
        ))}
        {!cards.length && <Row title={t('deck.empty')} last />}
      </Section>
      {adding ? (
        <>
          <Button
            title={t('deck.addSelected', { count: picked.size })}
            disabled={!picked.size}
            onPress={async () => {
              await update({ cardIds: [...deck.cardIds, ...picked] });
              setPicked(new Set());
              setAdding(false);
            }}
          />
          <CardPicker
            selected={picked}
            exclude={new Set(deck.cardIds)}
            onToggle={(id) =>
              setPicked((s) => {
                const n = new Set(s);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              })
            }
          />
        </>
      ) : (
        <Button variant="secondary" title={t('deck.addCards')} onPress={() => setAdding(true)} />
      )}
      <Button
        variant="danger"
        title={t('deck.delete')}
        onPress={() =>
          confirm(t('deck.deleteTitle'), t('deck.deleteBody'), async () => {
            await deleteDeck(deck.id);
            goBack();
          }, t('common.delete'), t('common.cancel'))
        }
      />
    </Screen>
  );
}
