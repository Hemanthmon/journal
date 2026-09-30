import { Stack } from 'expo-router';
import { SyncIndicator } from '../../../components/widgets';
import { useTheme } from '../../../lib/theme';

export default function UrgesLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Urge Tracker', headerRight: () => <SyncIndicator /> }} />
      <Stack.Screen name="[id]" options={{ title: 'Urge' }} />
    </Stack>
  );
}
