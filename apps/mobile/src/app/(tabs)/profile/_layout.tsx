import { Stack } from 'expo-router';
import { StackHeader } from '../../../components/StackHeader';
import { SyncIndicator } from '../../../components/widgets';
import { useTheme } from '../../../lib/theme';

/** The list screen always sits underneath, so Back from any screen in this tab returns to it. */
export const unstable_settings = { anchor: 'index' };

export default function ProfileLayout() {
  const { c } = useTheme();
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: c.bg },
        // JS header that applies the safe-area top inset itself (see StackHeader).
        header: ({ navigation, route, options, back }) => (
          <StackHeader
            title={options.title ?? route.name}
            canGoBack={!!back}
            onBack={navigation.goBack}
            right={options.headerRight?.({ tintColor: c.text, canGoBack: !!back })}
          />
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Profile', headerRight: () => <SyncIndicator /> }} />
      <Stack.Screen name="account" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="reauth" options={{ title: 'Sign in again' }} />
      <Stack.Screen name="data" options={{ title: 'Delete data' }} />
      <Stack.Screen name="sharing" options={{ title: 'Dashboard access' }} />
      <Stack.Screen name="habits/index" options={{ title: 'Manage habits' }} />
      <Stack.Screen name="habits/[id]" options={{ title: 'Habit' }} />
      <Stack.Screen name="questions/index" options={{ title: 'Manage questions' }} />
      <Stack.Screen name="questions/[id]" options={{ title: 'Question' }} />
      <Stack.Screen name="reminders/index" options={{ title: 'Daily reminders' }} />
      <Stack.Screen name="reminders/[id]" options={{ title: 'Edit reminder' }} />
      <Stack.Screen name="emotions" options={{ title: 'Manage emotions' }} />
      <Stack.Screen name="history" options={{ title: 'Daily routine history' }} />
      <Stack.Screen name="habit-history" options={{ title: 'Habit history' }} />
      <Stack.Screen name="conflicts" options={{ title: 'Resolve edits' }} />
    </Stack>
  );
}
