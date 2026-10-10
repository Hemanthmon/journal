import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { LaunchScreen } from '../components/LaunchScreen';
import { Body, Button, Screen } from '../components/ui';
import { queryClient } from '../lib/queryClient';
import { useTheme } from '../lib/theme';
import { useSession } from '../state/session';

// Keep the native splash up until the launch screen (same picture) is on screen.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const status = useSession((s) => s.status);
  const bootstrap = useSession((s) => s.bootstrap);
  const { c, dark } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState(false);

  const start = () => {
    setError(null);
    bootstrap().catch(() => setError('The app could not open its local database.'));
  };
  useEffect(start, [bootstrap]);
  // If opening fails, the error screen replaces the launch screen: let the splash go.
  useEffect(() => {
    if (error) void SplashScreen.hideAsync();
  }, [error]);

  // Expo Router already provides the SafeAreaProvider (with correct initial metrics);
  // adding another one here made nested views measure insets on their own.
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {error ? (
        <Screen edges={['top', 'bottom']}>
          <Body>{error}</Body>
          <Button title="Try again" onPress={start} />
        </Screen>
      ) : !launched ? (
        <LaunchScreen ready={status !== 'loading'} onDone={() => setLaunched(true)} />
      ) : (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
        </Stack>
      )}
    </QueryClientProvider>
  );
}
