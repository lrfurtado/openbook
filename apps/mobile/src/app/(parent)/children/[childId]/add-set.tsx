import type { SourceType } from '@openbook/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Body, Button, Notice, Row, Screen, Section } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { addSet, getChild, listDecks, listPacks } from '@/lib/repo';
import { goBack } from '@/lib/nav';

/** Start a new set from a downloaded pack or a custom deck (FR-32/34/37). */
export default function AddSet() {
  const { t } = useTranslation();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const q = useLiveQuery(async () => ({ packs: (await listPacks()).filter((p) => p.status === 'complete'), decks: await listDecks() }), ['pack', 'deck'], []);
  const [problem, setProblem] = useState<{ reason: string; sourceType: SourceType; sourceId: string } | null>(null);

  const add = async (sourceType: SourceType, sourceId: string, restart = false) => {
    const child = await getChild(childId);
    if (!child) return;
    const res = await addSet(child, sourceType, sourceId, restart);
    if (res.ok) goBack();
    else setProblem({ reason: res.reason, sourceType, sourceId });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('program.addSet') }} />
      {problem && (
        <Notice>
          {t(`program.problem.${problem.reason}`)}
        </Notice>
      )}
      {problem?.reason === 'exhausted' && (
        <Button title={t('program.restart')} onPress={() => add(problem.sourceType, problem.sourceId, true)} />
      )}
      <Section title={t('library.packs')}>
        {q.data?.packs.map((p, i) => (
          <Row key={p.id} title={p.title.en} subtitle={t('library.cards', { count: p.cardIds.length })} onPress={() => add('pack', p.id)} last={i === q.data!.packs.length - 1} />
        ))}
        {!q.data?.packs.length && <Row title={t('library.getPacks')} onPress={() => router.push('/catalog')} last />}
      </Section>
      <Section title={t('library.decks')}>
        {q.data?.decks.map((d, i) => (
          <Row key={d.id} title={d.title} subtitle={t('library.cards', { count: d.cardIds.length })} onPress={() => add('deck', d.id)} last={i === q.data!.decks.length - 1} />
        ))}
        {!q.data?.decks.length && <Row title={t('program.noDecks')} last />}
      </Section>
      <Body muted>{t('program.addSetHelp')}</Body>
    </Screen>
  );
}
