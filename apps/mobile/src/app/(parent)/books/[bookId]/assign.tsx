import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { Notice, Row, Screen, Section } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { addActiveBook, listChildren } from '@/lib/repo';
import { goBack } from '@/lib/nav';

/** FR-71: add a book to a child's Program as an active book. */
export default function AssignBook() {
  const { t } = useTranslation();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const children = useLiveQuery(listChildren, ['child'], []);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Screen>
      <Stack.Screen options={{ title: t('books.addToChild') }} />
      {problem && <Notice>{problem}</Notice>}
      <Section>
        {children.data?.map((c, i) => (
          <Row
            key={c.id}
            last={i === children.data!.length - 1}
            title={c.nickname}
            left={<Text style={{ fontSize: 28 }}>{c.avatar}</Text>}
            onPress={async () => {
              const res = await addActiveBook(c, bookId);
              if (res === 'ok') goBack();
              else setProblem(t(`books.assign.${res}`, { max: c.settings.maxActiveBooks }));
            }}
          />
        ))}
      </Section>
    </Screen>
  );
}
