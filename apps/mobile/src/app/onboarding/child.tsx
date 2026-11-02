import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChildForm } from '@/components/ChildForm';
import { Body, Screen, Title } from '@/components/ui';
import { createChild } from '@/lib/repo';

export default function FirstChild() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Title>{t('onboarding.childTitle')}</Title>
      <Body muted>{t('onboarding.childBody')}</Body>
      <ChildForm
        submitLabel={t('common.continue')}
        onSubmit={async (v) => {
          await createChild(v.nickname, v.avatar, v.birthMonth);
          router.replace('/onboarding/pack');
        }}
      />
    </Screen>
  );
}
