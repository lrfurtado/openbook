import { EXIT_LONG_PRESS_MS } from '@openbook/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * FR-30: an invisible corner target; a ≥1 s long-press pauses, so random taps by a child do nothing.
 */
export function ExitCorner({ onLongPress }: { onLongPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityLabel={t('session.exitHint')}
      delayLongPress={EXIT_LONG_PRESS_MS}
      onLongPress={onLongPress}
      onPress={() => {}}
      style={styles.corner}
    />
  );
}

export function PauseOverlay({ onResume, onExit }: { onResume: () => void; onExit: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.overlay}>
      <Text style={styles.pausedTitle}>{t('session.paused')}</Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Pressable accessibilityRole="button" onPress={onResume} style={[styles.pauseBtn, { backgroundColor: '#2E8B57' }]}>
          <Text style={styles.pauseBtnText}>{t('session.resume')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onExit} style={[styles.pauseBtn, { backgroundColor: '#555' }]}>
          <Text style={styles.pauseBtnText}>{t('session.exit')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function RotateHint() {
  const { t } = useTranslation();
  return (
    <View style={styles.overlay}>
      <Text style={{ fontSize: 64 }}>⟳</Text>
      <Text style={styles.pausedTitle}>{t('session.rotate')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute', top: 0, left: 0, width: 88, height: 88, zIndex: 10 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    zIndex: 20,
  },
  pausedTitle: { fontSize: 28, fontWeight: '800', color: '#222' },
  pauseBtn: { paddingHorizontal: 32, paddingVertical: 18, borderRadius: 16, minWidth: 140, alignItems: 'center' },
  pauseBtnText: { color: '#fff', fontSize: 20, fontWeight: '800' },
});
