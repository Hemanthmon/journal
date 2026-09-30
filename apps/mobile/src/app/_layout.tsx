import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Body, Button, Loading, Screen } from '../components/ui';
import { queryClient } from '../lib/queryClient';
import { useTheme } from '../lib/theme';
import { useSession } from '../state/session';

export default function RootLayout() {
  const status = useSession((s) => s.status);
  const bootstrap = useSession((s) => s.bootstrap);
  const { c, dark } = useTheme();
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setError(null);
    bootstrap().catch(() => setError('The app could not open its local database.'));
  };
  useEffect(start, [bootstrap]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        {error ? (
          <Screen edges={['top']}>
            <Body>{error}</Body>
            <Button title="Try again" onPress={start} />
          </Screen>
        ) : status === 'loading' ? (
          <Loading />
        ) : (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" />
          </Stack>
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
