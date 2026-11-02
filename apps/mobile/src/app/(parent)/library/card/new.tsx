import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CardEditor } from '@/components/CardEditor';
import { Screen } from '@/components/ui';
import { goBack } from '@/lib/nav';

export default function NewCard() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('cardEditor.newTitle') }} />
      <CardEditor onSaved={() => goBack()} />
    </Screen>
  );
}
