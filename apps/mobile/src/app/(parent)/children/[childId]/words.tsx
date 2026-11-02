import { readiness } from '@openbook/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Body, Button, Field, Row, Screen, Section } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { addKnownWords, listBooks, listKnownWords, removeKnownWord } from '@/lib/repo';

/** FR-74/75: known words and per-book readiness. Information only — never blocks reading. */
export default function Words() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const q = useLiveQuery(async () => ({ words: await listKnownWords(childId), books: await listBooks() }), ['knownWord', 'book'], [childId]);
  const [input, setInput] = useState('');
  const words = q.data?.words ?? [];

  return (
    <Screen>
      <Stack.Screen options={{ title: t('words.title') }} />
      <Field label={t('words.add')} value={input} onChangeText={setInput} placeholder={t('words.addPlaceholder')} autoCapitalize="none" />
      <Button
        title={t('words.addButton')}
        disabled={!input.trim()}
        onPress={async () => {
          await addKnownWords(childId, input.split(/[\s,]+/), 'manual');
          setInput('');
        }}
      />
      <Section title={t('words.known', { count: words.length })}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          {words.map((w) => (
            <Pressable
              key={w.word}
              accessibilityRole="button"
              accessibilityLabel={t('words.removeLabel', { word: w.word })}
              onPress={() => removeKnownWord(childId, w.word)}
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: theme.text }}>{w.word} ✕</Text>
            </Pressable>
          ))}
          {!words.length && <Body muted>{t('words.none')}</Body>}
        </View>
      </Section>
      <Section title={t('words.readiness')}>
        {q.data?.books.map((b, i) => {
          const r = readiness(b.vocabulary, words);
          return (
            <Row
              key={b.id}
              last={i === q.data!.books.length - 1}
              title={`${b.title.en} — ${r.percent}%`}
              subtitle={r.newWords.length ? t('words.newWords', { words: r.newWords.slice(0, 12).join(', ') + (r.newWords.length > 12 ? '…' : '') }) : t('words.allKnown')}
            />
          );
        })}
      </Section>
    </Screen>
  );
}
