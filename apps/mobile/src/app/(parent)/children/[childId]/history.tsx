import { computeStreaks, localDate, logDate, type SessionLog } from '@openbook/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Row, Screen, Section, Title } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { listLogs, listSets, getBook, sourceTitle } from '@/lib/repo';

async function load(childId: string) {
  const logs = (await listLogs(childId)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const sets = new Map((await listSets(childId)).map((s) => [s.id, s]));
  const titles = new Map<string, string>();
  for (const l of logs) {
    const key = l.setId ?? l.bookId ?? '';
    if (titles.has(key)) continue;
    if (l.setId) {
      const s = sets.get(l.setId);
      titles.set(key, s ? await sourceTitle(s.sourceType, s.sourceId) : '');
    } else if (l.bookId) titles.set(key, (await getBook(l.bookId))?.title.en ?? '');
  }
  return { logs, titles };
}

/** FR-42: session log, daily completion and streaks. No scores. */
export default function History() {
  const { t } = useTranslation();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const q = useLiveQuery(() => load(childId), ['log', 'set', 'book'], [childId]);
  const logs = q.data?.logs ?? [];
  const streaks = computeStreaks(logs, localDate());
  const byDay = new Map<string, SessionLog[]>();
  for (const l of logs) byDay.set(logDate(l), [...(byDay.get(logDate(l)) ?? []), l]);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('history.title') }} />
      <Title>{t('history.streak', { count: streaks.current })}</Title>
      <Body muted>{t('history.longest', { count: streaks.longest })}</Body>
      {[...byDay].map(([day, items]) => (
        <Section key={day} title={day}>
          {items.map((l, i) => (
            <Row
              key={l.id}
              last={i === items.length - 1}
              title={`${l.type === 'flash' ? '🃏' : '📖'} ${q.data?.titles.get(l.setId ?? l.bookId ?? '') ?? ''}`}
              subtitle={`${new Date(l.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${
                l.type === 'flash' ? t('history.cards', { count: l.cardIdsShown?.length ?? 0 }) : t('history.pages', { count: l.pagesShown ?? 0 })
              } · ${l.completed ? `✓ ${t('history.completed')}` : `○ ${t('history.partial')}`}`}
            />
          ))}
        </Section>
      ))}
      {!logs.length && <Body muted>{t('history.empty')}</Body>}
    </Screen>
  );
}
