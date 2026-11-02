import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet } from 'react-native';
import { MediaImage } from '@/components/CardImage';
import { CardEditor } from '@/components/CardEditor';
import { Body, Button, Loading, Row, Screen, Section, Title } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { confirm } from '@/lib/confirm';
import { deleteUserCard, getCard } from '@/lib/repo';
import { goBack } from '@/lib/nav';

/** Card detail: edit own cards; facts and attribution for official cards (FR-13). */
export default function CardDetail() {
  const { t } = useTranslation();
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const q = useLiveQuery(() => getCard(cardId), ['card'], [cardId]);
  if (q.loading) return <Loading />;
  const card = q.data;
  if (!card) return <Screen><Body>{t('common.notFound')}</Body></Screen>;

  if (card.source === 'user') {
    return (
      <Screen>
        <Stack.Screen options={{ title: card.name.en }} />
        <CardEditor card={card} onSaved={() => goBack()} />
        <Button
          variant="danger"
          title={t('cardEditor.delete')}
          onPress={() =>
            confirm(t('cardEditor.deleteTitle'), t('cardEditor.deleteBody'), async () => {
              await deleteUserCard(card.id);
              goBack();
            }, t('common.delete'), t('common.cancel'))
          }
        />
      </Screen>
    );
  }

  const a = card.attribution;
  return (
    <Screen>
      <Stack.Screen options={{ title: card.name.en }} />
      <MediaImage mediaKey={card.image.localPath} style={styles.image} contentFit="contain" accessibilityLabel={card.name.en} />
      <Title>{card.name.en}</Title>
      <Section title={t('card.facts')}>
        {card.facts.map((f, i) => (
          <Row key={i} title={f.text.en} subtitle={t('card.level', { level: f.level })} last={i === card.facts.length - 1} />
        ))}
      </Section>
      {a && (
        <Section title={t('card.attribution')}>
          <Row title={t('card.author')} subtitle={a.author} />
          <Row title={t('card.license')} subtitle={a.license} onPress={() => Linking.openURL(a.licenseUrl)} />
          <Row title={t('card.source')} subtitle={a.sourceUrl} onPress={() => Linking.openURL(a.sourceUrl)} last />
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: '#fff' },
});
