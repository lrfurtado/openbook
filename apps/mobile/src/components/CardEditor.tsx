import type { Card } from '@openbook/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';
import { pickPhoto, type PickedPhoto } from '@/features/photos';
import { saveUserCard } from '@/lib/repo';
import { MediaImage } from './CardImage';
import { Body, Button, Field, Notice, Section, ToggleRow } from './ui';

/** FR-8: photo → crop → name (required) → facts L1–L3 (optional). */
export function CardEditor({ card, onSaved }: { card?: Card; onSaved: (card: Card) => void }) {
  const { t } = useTranslation();
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [name, setName] = useState(card?.name.en ?? '');
  const [facts, setFacts] = useState<string[]>([1, 2, 3].map((l) => card?.facts.find((f) => f.level === l)?.text.en ?? ''));
  const [readAloud, setReadAloud] = useState(card?.readAloud !== false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const p = await pickPhoto(source, [4, 3]);
      if (p) setPhoto(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const hasImage = !!photo || !!card?.image.localPath;

  return (
    <View style={{ gap: 14 }}>
      <Notice tone="info">{t('cardEditor.tip')}</Notice>
      {photo ? (
        <Image source={{ uri: photo.uri }} style={styles.preview} contentFit="contain" />
      ) : card?.image.localPath ? (
        <MediaImage mediaKey={card.image.localPath} style={styles.preview} contentFit="contain" />
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {Platform.OS !== 'web' && <Button style={{ flex: 1 }} variant="secondary" title={t('cardEditor.camera')} onPress={() => choose('camera')} />}
        <Button style={{ flex: 1 }} variant="secondary" title={t(hasImage ? 'cardEditor.replace' : 'cardEditor.library')} onPress={() => choose('library')} />
      </View>
      {!!error && <Body>{error}</Body>}
      <Field label={t('cardEditor.name')} value={name} onChangeText={setName} placeholder={t('cardEditor.namePlaceholder')} maxLength={40} />
      {facts.map((f, i) => (
        <Field
          key={i}
          label={t('cardEditor.fact', { level: i + 1 })}
          value={f}
          onChangeText={(v) => setFacts((prev) => prev.map((x, j) => (j === i ? v : x)))}
          placeholder={t('cardEditor.factPlaceholder')}
          multiline
        />
      ))}
      <Section>
        <ToggleRow label={t('cardEditor.readAloud')} value={readAloud} onChange={setReadAloud} last />
      </Section>
      <Button
        title={t('common.save')}
        disabled={!name.trim() || !hasImage}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            const saved = await saveUserCard({
              id: card?.id,
              name,
              facts,
              imageUri: photo?.uri,
              width: photo?.width,
              height: photo?.height,
              readAloud,
            });
            onSaved(saved);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: '#fff' },
});
