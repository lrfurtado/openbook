import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Body, Button, Screen } from '@/components/ui';
import { NAME_RED } from '@openbook/shared';

export default function Welcome() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Screen style={styles.center}>
      <Text style={styles.logo}>📖</Text>
      <Text accessibilityRole="header" style={[styles.brand, { color: NAME_RED }]}>
        OpenBook
      </Text>
      <Body style={{ textAlign: 'center' } as object}>{t('onboarding.tagline')}</Body>
      <View style={{ gap: 8, alignSelf: 'stretch' }}>
        {(['step1', 'step2', 'step3'] as const).map((k, i) => (
          <Text key={k} style={{ color: theme.text, fontSize: 16 }}>
            {i + 1}. {t(`onboarding.${k}`)}
          </Text>
        ))}
      </View>
      <Body muted>{t('onboarding.inspired')}</Body>
      <Button title={t('onboarding.start')} onPress={() => router.push('/onboarding/pin')} style={{ alignSelf: 'stretch' }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', flexGrow: 1, gap: 20 },
  logo: { fontSize: 72 },
  brand: { fontSize: 44, fontWeight: '900' },
});
