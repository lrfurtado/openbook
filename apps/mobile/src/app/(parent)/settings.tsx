import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PinPad } from '@/components/PinPad';
import { Body, Button, formatBytes, Row, Screen, Section } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { checkPin, setPin } from '@/lib/pin';
import { listPacks } from '@/lib/repo';

type PinStep = 'idle' | 'current' | 'new' | 'confirm';

/** PIN change, storage usage per pack (NFR-4), credits and privacy. */
export default function Settings() {
  const { t } = useTranslation();
  const packs = useLiveQuery(listPacks, ['pack'], []);
  const [step, setStep] = useState<PinStep>('idle');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const total = packs.data?.reduce((n, p) => n + p.bytes, 0) ?? 0;

  if (step !== 'idle') {
    return (
      <Screen>
        <PinPad
          key={step}
          title={t(step === 'current' ? 'pin.enterCurrent' : step === 'new' ? 'pin.chooseNew' : 'pin.confirm')}
          error={error}
          onComplete={async (pin) => {
            setError(null);
            if (step === 'current') return (await checkPin(pin)) ? setStep('new') : setError(t('pin.wrong'));
            if (step === 'new') {
              setFirst(pin);
              return setStep('confirm');
            }
            if (pin !== first) {
              setError(t('pin.mismatch'));
              return setStep('new');
            }
            await setPin(pin);
            setDone(true);
            setStep('idle');
          }}
        />
        <Button variant="ghost" title={t('common.cancel')} onPress={() => setStep('idle')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('parent.settings') }} />
      <Section title={t('settingsScreen.security')}>
        <Row title={t('settingsScreen.changePin')} subtitle={done ? `✓ ${t('settingsScreen.pinChanged')}` : undefined} onPress={() => setStep('current')} last />
      </Section>
      <Section title={t('settingsScreen.storage', { size: formatBytes(total) })}>
        {packs.data?.map((p, i) => (
          <Row key={p.id} title={p.title.en} subtitle={formatBytes(p.bytes)} last={i === packs.data!.length - 1} onPress={() => router.push(`/catalog/${p.id}`)} />
        ))}
        {!packs.data?.length && <Row title={t('settingsScreen.noPacks')} last />}
      </Section>
      <Section title={t('settingsScreen.about')}>
        <Row title={t('parent.credits')} onPress={() => router.push('/credits')} />
        <Row title={t('settingsScreen.privacy')} subtitle={t('settingsScreen.privacyBody')} />
        <Row title={t('settingsScreen.account')} subtitle={t('settingsScreen.accountBody')} last />
      </Section>
      <Body muted>{t('settingsScreen.reminderNote')}</Body>
    </Screen>
  );
}
