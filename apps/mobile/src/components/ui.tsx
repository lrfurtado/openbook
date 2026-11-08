import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const content = [styles.content, { paddingBottom: 24 + insets.bottom }, style];
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: t.bg }, content]}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Section({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.section}>
      {(title || right) && (
        <View style={styles.sectionHeader}>
          {title ? (
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: t.muted }]}>
              {title}
            </Text>
          ) : (
            <View />
          )}
          {right}
        </View>
      )}
      <View style={[styles.group, { backgroundColor: t.surface, borderColor: t.border }]}>{children}</View>
    </View>
  );
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <Text style={[styles.body, { color: muted ? t.muted : t.text }, style as object]}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
      {children}
    </Text>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  accessibilityHint,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.primary : variant === 'danger' ? t.danger : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? t.onPrimary : t.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      accessibilityHint={accessibilityHint}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: variant === 'secondary' ? t.primary : 'transparent' },
        variant === 'secondary' && styles.buttonOutline,
        (disabled || loading) && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Row({
  title,
  subtitle,
  right,
  left,
  onPress,
  last,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  left?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const inner = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }]}>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: t.text }]}>{title}</Text>
        {!!subtitle && <Text style={[styles.rowSubtitle, { color: t.muted }]}>{subtitle}</Text>}
      </View>
      {right}
      {onPress && !right && <Text style={{ color: t.muted, fontSize: 20 }}>›</Text>}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      {inner}
    </Pressable>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
  last,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  /** A fixed step, or one chosen from the current value and direction (e.g. finer at small values). */
  step?: number | ((value: number, direction: 1 | -1) => number);
  format?: (v: number) => string;
  onChange: (v: number) => void;
  last?: boolean;
}) {
  const t = useTheme();
  const set = (v: number) => onChange(Math.round(Math.min(max, Math.max(min, v)) * 100) / 100);
  const by = (d: 1 | -1) => (typeof step === 'function' ? step(value, d) : step) * d;
  return (
    <Row
      title={label}
      last={last}
      right={
        <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: format(value) }}>
          <Pressable accessibilityLabel={`Decrease ${label}`} style={[styles.stepBtn, { borderColor: t.border }]} disabled={value <= min} onPress={() => set(value + by(-1))}>
            <Text style={[styles.stepTxt, { color: value <= min ? t.border : t.text }]}>−</Text>
          </Pressable>
          <Text style={[styles.stepValue, { color: t.text }]}>{format(value)}</Text>
          <Pressable accessibilityLabel={`Increase ${label}`} style={[styles.stepBtn, { borderColor: t.border }]} disabled={value >= max} onPress={() => set(value + by(1))}>
            <Text style={[styles.stepTxt, { color: value >= max ? t.border : t.text }]}>+</Text>
          </Pressable>
        </View>
      }
    />
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { borderColor: t.border }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: t.primary }]}
          >
            <Text style={{ color: selected ? t.onPrimary : t.text, fontWeight: selected ? '700' : '500', textAlign: 'center' }}>
              {selected ? '✓ ' : ''}
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleRow({ label, value, onChange, last }: { label: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return <Row title={label} last={last} right={<Switch accessibilityLabel={label} value={value} onValueChange={onChange} />} />;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.muted, fontWeight: '600' }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        {...props}
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }, props.style]}
      />
    </View>
  );
}

/** A text field that edits a local draft and commits it on blur. Give it a `key` to reset it. */
export function DraftField({ label, initial, onCommit, ...props }: Omit<TextInputProps, 'value' | 'onChangeText'> & { label: string; initial: string; onCommit: (v: string) => string | void }) {
  const [value, setValue] = useState(initial);
  return (
    <Field
      label={label}
      {...props}
      value={value}
      onChangeText={setValue}
      onBlur={() => {
        const corrected = onCommit(value);
        if (typeof corrected === 'string') setValue(corrected);
      }}
    />
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: t.text }]}>{title}</Text>
      {!!body && <Text style={{ color: t.muted, textAlign: 'center', fontSize: 15 }}>{body}</Text>}
      {action}
    </View>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={[styles.progress, { backgroundColor: t.border }]}
    >
      <View style={{ width: `${Math.round(value * 100)}%`, backgroundColor: t.primary, height: '100%', borderRadius: 4 }} />
    </View>
  );
}

export function Notice({ children, tone = 'warning' }: { children: ReactNode; tone?: 'warning' | 'info' }) {
  const t = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: tone === 'warning' ? t.warningBg : t.surface, borderColor: tone === 'warning' ? t.warning : t.border }]}>
      <Text style={{ color: tone === 'warning' ? t.warning : t.text, fontSize: 14 }}>
        {tone === 'warning' ? '⚠︎ ' : 'ℹ︎ '}
        {children}
      </Text>
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={[styles.empty, { flex: 1, backgroundColor: t.bg }]}>
      <ActivityIndicator color={t.primary} />
    </View>
  );
}

export const formatBytes = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`;

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  body: { fontSize: 16, lineHeight: 22 },
  title: { fontSize: 26, fontWeight: '800' },
  button: { minHeight: 48, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonOutline: { borderWidth: 1.5 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 52 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { fontSize: 13, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 20, fontWeight: '700' },
  stepValue: { minWidth: 52, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  segment: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, minHeight: 46 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  progress: { height: 8, borderRadius: 4, overflow: 'hidden' },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12 },
});
