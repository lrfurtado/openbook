import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PinPad } from '@/components/PinPad';
import { Body, Screen } from '@/components/ui';
import { setPin } from '@/lib/pin';

/** FR-51: the parent PIN is set during onboarding. */
export default function SetPin() {
  const { t } = useTranslation();
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen>
      <Body muted>{t('onboarding.pinIntro')}</Body>
      <PinPad
        key={first ?? 'first'}
        title={first ? t('pin.confirm') : t('pin.choose')}
        error={error}
        onComplete={async (pin) => {
          if (!first) {
            setFirst(pin);
            setError(null);
          } else if (pin !== first) {
            setFirst(null);
            setError(t('pin.mismatch'));
          } else {
            await setPin(pin);
            router.replace('/onboarding/child');
          }
        }}
      />
    </Screen>
  );
}
