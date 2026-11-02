import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from './theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/** A 4-digit keypad. Calls `onComplete` once four digits are entered, then clears. */
export function PinPad({
  title,
  onComplete,
  error,
  lockedUntil,
}: {
  title: string;
  onComplete: (pin: string) => void;
  error?: string | null;
  lockedUntil?: number | null;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [pin, setPin] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const locked = !!lockedUntil && lockedUntil > now;

  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [locked]);

  const press = (k: string) => {
    if (locked) return;
    if (k === '⌫') return setPin((p) => p.slice(0, -1));
    if (!k) return;
    const next = pin + k;
    if (next.length === 4) {
      setPin('');
      onComplete(next);
    } else setPin(next);
  };

  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
        {title}
      </Text>
      <View style={styles.dots} accessibilityLabel={tr('pin.entered', { count: pin.length })}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, { borderColor: t.text }, i < pin.length && { backgroundColor: t.text }]} />
        ))}
      </View>
      <Text style={[styles.error, { color: t.danger }]} accessibilityLiveRegion="polite">
        {locked ? tr('pin.locked', { seconds: Math.ceil((lockedUntil! - now) / 1000) }) : (error ?? ' ')}
      </Text>
      <View style={styles.grid}>
        {KEYS.map((k, i) => (
          <Pressable
            key={i}
            accessibilityRole={k ? 'button' : undefined}
            accessibilityLabel={k === '⌫' ? tr('pin.delete') : k}
            disabled={!k || locked}
            onPress={() => press(k)}
            style={({ pressed }) => [
              styles.key,
              k && { backgroundColor: t.surface, borderColor: t.border },
              pressed && { opacity: 0.6 },
              locked && { opacity: 0.4 },
            ]}
          >
            <Text style={[styles.keyText, { color: t.text }]}>{k}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 16, paddingVertical: 16 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 16 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  error: { minHeight: 20, fontSize: 14, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 264, gap: 12, justifyContent: 'center' },
  key: { width: 72, height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  keyText: { fontSize: 26, fontWeight: '600' },
});
