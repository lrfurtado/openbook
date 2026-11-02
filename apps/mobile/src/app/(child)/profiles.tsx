import { useFocusEffect, router } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { child as c } from '@/components/theme';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { listChildren } from '@/lib/repo';
import { useAppDispatch } from '@/store';
import { gateActions } from '@/store/appSlice';

/** FR-53: the child area needs no PIN. Entering it relocks the parent area. */
export default function Profiles() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const children = useLiveQuery(listChildren, ['child'], []);

  useFocusEffect(
    useCallback(() => {
      dispatch(gateActions.lock());
    }, [dispatch]),
  );

  return (
    <SafeAreaView style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('profiles.title')}
      </Text>
      <View style={styles.grid}>
        {children.data?.map((ch) => (
          <Pressable
            key={ch.id}
            accessibilityRole="button"
            accessibilityLabel={ch.nickname}
            onPress={() => router.push(`/${ch.id}/today`)}
            style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.96 }] }]}
          >
            <Text style={styles.avatar}>{ch.avatar}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {ch.nickname}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.push('/home')} style={styles.parent}>
        <Text style={styles.parentText}>⚙︎ {t('profiles.grownUps')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 28 },
  title: { fontSize: 32, fontWeight: '900', color: c.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, justifyContent: 'center' },
  tile: { width: 160, height: 180, borderRadius: 32, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  avatar: { fontSize: 84 },
  name: { fontSize: 22, fontWeight: '800', color: c.text, maxWidth: 140 },
  parent: { position: 'absolute', bottom: 24, right: 24, padding: 14, minHeight: 48, justifyContent: 'center' },
  parentText: { fontSize: 16, color: '#555', fontWeight: '600' },
});
