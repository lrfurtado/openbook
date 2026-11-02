import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChildForm } from '@/components/ChildForm';
import { Screen } from '@/components/ui';
import { createChild } from '@/lib/repo';

export default function NewChild() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('parent.addChild') }} />
      <ChildForm
        submitLabel={t('common.save')}
        onSubmit={async (v) => {
          const child = await createChild(v.nickname, v.avatar, v.birthMonth);
          router.replace(`/children/${child.id}`);
        }}
      />
    </Screen>
  );
}
