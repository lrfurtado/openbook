import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PinPad } from '@/components/PinPad';
import { useTheme } from '@/components/theme';
import { Body, Button, Field, Screen, Title } from '@/components/ui';
import { checkPin, setPin } from '@/lib/pin';
import { useAppDispatch, useAppSelector } from '@/store';
import { appActions, gateActions } from '@/store/appSlice';
import { goBack } from '@/lib/nav';

function challenge() {
  const a = 12 + Math.floor(Math.random() * 30);
  const b = 3 + Math.floor(Math.random() * 7);
  return { question: `${a} × ${b}`, answer: a * b };
}

/** FR-52: reset without an account — solve an arithmetic challenge, then choose a new PIN. */
function ResetPin({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [ch] = useState(challenge);
  const [answer, setAnswer] = useState('');
  const [solved, setSolved] = useState(false);
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!solved) {
    return (
      <Screen>
        <Title>{t('pin.resetTitle')}</Title>
        <Body muted>{t('pin.resetBody')}</Body>
        <Field label={t('pin.challenge', { question: ch.question })} value={answer} onChangeText={setAnswer} keyboardType="number-pad" />
        {!!error && <Body>{error}</Body>}
        <Button
          title={t('common.continue')}
          onPress={() => (Number(answer) === ch.answer ? setSolved(true) : setError(t('pin.challengeWrong')))}
        />
        <Button variant="ghost" title={t('common.cancel')} onPress={onCancel} />
      </Screen>
    );
  }
  return (
    <Screen>
      <PinPad
        key={first ?? 'first'}
        title={first ? t('pin.confirm') : t('pin.chooseNew')}
        error={error}
        onComplete={async (pin) => {
          if (!first) return setFirst(pin);
          if (pin !== first) {
            setFirst(null);
            return setError(t('pin.mismatch'));
          }
          await setPin(pin);
          onDone();
        }}
      />
    </Screen>
  );
}

function PinGate() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const lockedUntil = useAppSelector((s) => s.app.pinLockedUntil);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const unlock = () => {
    dispatch(appActions.pinSucceeded());
    dispatch(gateActions.unlock());
  };

  if (resetting) return <ResetPin onDone={unlock} onCancel={() => setResetting(false)} />;
  return (
    <Screen>
      <PinPad
        title={t('pin.enter')}
        error={error}
        lockedUntil={lockedUntil}
        onComplete={async (pin) => {
          if (lockedUntil && lockedUntil > Date.now()) return;
          if (await checkPin(pin)) unlock();
          else {
            dispatch(appActions.pinFailed({ now: Date.now() }));
            setError(t('pin.wrong'));
          }
        }}
      />
      <Button variant="ghost" title={t('pin.forgot')} onPress={() => setResetting(true)} />
      <Button variant="ghost" title={t('pin.backToKids')} onPress={() => goBack('/profiles')} />
    </Screen>
  );
}

/** FR-51 / AC-6: no parent screen renders until the PIN is entered. */
export default function ParentLayout() {
  const unlocked = useAppSelector((s) => s.gate.unlocked);
  const theme = useTheme();
  const { t } = useTranslation();
  if (!unlocked) return <PinGate />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.bg },
        headerShown: true,
        title: t('parent.title'),
      }}
    />
  );
}
