import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { Button, Row, Screen, Section } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { listChildren } from '@/lib/repo';

export default function ParentHome() {
  const { t } = useTranslation();
  const children = useLiveQuery(listChildren, ['child'], []);
  return (
    <Screen>
      <Stack.Screen options={{ title: t('parent.title') }} />
      <Section title={t('parent.children')}>
        {children.data?.map((c) => (
          <Row
            key={c.id}
            title={c.nickname}
            subtitle={t('parent.childSubtitle')}
            left={<Text style={{ fontSize: 30 }}>{c.avatar}</Text>}
            onPress={() => router.push(`/children/${c.id}`)}
          />
        ))}
        <Row title={`＋ ${t('parent.addChild')}`} onPress={() => router.push('/children/new')} last />
      </Section>
      <Section title={t('parent.content')}>
        <Row title={t('parent.catalog')} subtitle={t('parent.catalogSub')} onPress={() => router.push('/catalog')} />
        <Row title={t('parent.library')} subtitle={t('parent.librarySub')} onPress={() => router.push('/library')} />
        <Row title={t('parent.books')} subtitle={t('parent.booksSub')} onPress={() => router.push('/books')} last />
      </Section>
      <Section>
        <Row title={t('parent.settings')} onPress={() => router.push('/settings')} />
        <Row title={t('parent.credits')} onPress={() => router.push('/credits')} last />
      </Section>
      <Button variant="secondary" title={t('parent.backToKids')} onPress={() => router.replace('/profiles')} />
    </Screen>
  );
}
