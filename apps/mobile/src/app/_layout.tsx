import i18n from '@/i18n';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { Loading } from '@/components/ui';
import { useRollover } from '@/hooks/useRollover';
import { getDb } from '@/lib/db';
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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <PersistGate loading={<Loading />} persistor={persistor}>
          <DbGate>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
          </DbGate>
        </PersistGate>
      </Provider>
    </SafeAreaProvider>
  );
}
