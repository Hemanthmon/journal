import { Stack } from 'expo-router';
import { SyncIndicator } from '../../../components/widgets';
import { useTheme } from '../../../lib/theme';

export default function ProfileLayout() {
  const { c } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTintColor: c.text,
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Profile', headerRight: () => <SyncIndicator /> }} />
      <Stack.Screen name="account" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="reauth" options={{ title: 'Sign in again' }} />
      <Stack.Screen name="data" options={{ title: 'Delete data' }} />
      <Stack.Screen name="habits/index" options={{ title: 'Manage habits' }} />
      <Stack.Screen name="habits/[id]" options={{ title: 'Habit' }} />
      <Stack.Screen name="questions/index" options={{ title: 'Manage questions' }} />
      <Stack.Screen name="questions/[id]" options={{ title: 'Question' }} />
      <Stack.Screen name="history" options={{ title: 'Daily routine history' }} />
      <Stack.Screen name="habit-history" options={{ title: 'Habit history' }} />
      <Stack.Screen name="conflicts" options={{ title: 'Resolve edits' }} />
    </Stack>
  );
}
