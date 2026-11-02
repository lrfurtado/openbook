import i18n from '@/i18n';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { Button, Loading } from '@/components/ui';
import { useRollover } from '@/hooks/useRollover';
import { getDb } from '@/lib/db';
import { claimTab, takeOver, type TabState } from '@/lib/tabLock';
import { persistor, store } from '@/store';

function DbGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'ready' | Error>('loading');
  useEffect(() => {
    getDb().then(
      () => setState('ready'),
      (e: unknown) => setState(e instanceof Error ? e : new Error(String(e))),
    );
  }, []);
  useRollover(state === 'ready');
  if (state === 'loading') return <Loading />;
  if (state instanceof Error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>{i18n.t('errors.db')}</Text>
        <Text style={{ marginTop: 8 }}>{state.message}</Text>
      </View>
    );
  }
  return <>{children}</>;
}

/** Web: only one tab may own the local database; others offer to take over instead of failing. */
function TabGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TabState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    claimTab().then((s) => {
      if (s === 'ok') persistor.persist();
      setState(s);
    });
  }, []);
  if (state === 'loading') return <Loading />;
  if (state === 'busy') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{i18n.t('errors.otherTab')}</Text>
        <Text style={{ textAlign: 'center' }}>{i18n.t('errors.otherTabBody')}</Text>
        <Button
          title={i18n.t('errors.useHere')}
          loading={busy}
          onPress={() => {
            setBusy(true);
            takeOver();
          }}
        />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <TabGate>
          <PersistGate loading={<Loading />} persistor={persistor}>
            <DbGate>
              <StatusBar style="auto" />
              <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
            </DbGate>
          </PersistGate>
        </TabGate>
      </Provider>
    </SafeAreaProvider>
  );
}
