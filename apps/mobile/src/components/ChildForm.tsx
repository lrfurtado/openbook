import { AVATARS } from '@openbook/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from './theme';
import { Button, Field } from './ui';

export interface ChildFormValue {
  nickname: string;
  avatar: string;
  birthMonth?: string;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** FR-40: nickname, built-in avatar and optional birth month — no photos, no full names. */
export function ChildForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Partial<ChildFormValue>;
  submitLabel: string;
  onSubmit: (v: ChildFormValue) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [avatar, setAvatar] = useState(initial?.avatar ?? AVATARS[0]);
  const [birthMonth, setBirthMonth] = useState(initial?.birthMonth ?? '');
  const [busy, setBusy] = useState(false);
  const monthOk = !birthMonth || MONTH_RE.test(birthMonth);

  return (
    <View style={{ gap: 16 }}>
      <Field label={t('child.nickname')} value={nickname} onChangeText={setNickname} placeholder={t('child.nicknamePlaceholder')} maxLength={24} autoCapitalize="words" />
      <Text style={{ color: theme.muted, fontWeight: '600' }}>{t('child.avatar')}</Text>
      <View style={styles.avatars} accessibilityRole="radiogroup">
        {AVATARS.map((a) => (
          <Pressable
            key={a}
            accessibilityRole="radio"
            accessibilityState={{ selected: a === avatar }}
            accessibilityLabel={a}
            onPress={() => setAvatar(a)}
            style={[styles.avatar, { borderColor: a === avatar ? theme.primary : theme.border, backgroundColor: theme.surface }]}
          >
            <Text style={{ fontSize: 34 }}>{a}</Text>
          </Pressable>
        ))}
      </View>
      <Field
        label={t('child.birthMonth')}
        value={birthMonth}
        onChangeText={setBirthMonth}
        placeholder="2024-05"
        keyboardType="numbers-and-punctuation"
        maxLength={7}
      />
      {!monthOk && <Text style={{ color: theme.danger }}>{t('child.birthMonthInvalid')}</Text>}
      <Text style={{ color: theme.muted, fontSize: 13 }}>{t('child.privacy')}</Text>
      <Button
        title={submitLabel}
        disabled={!nickname.trim() || !monthOk}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await onSubmit({ nickname: nickname.trim(), avatar, birthMonth: birthMonth || undefined });
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
});
