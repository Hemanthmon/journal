import { Stack } from 'expo-router';
import { StackHeader } from '../../../components/StackHeader';
import { SyncIndicator } from '../../../components/widgets';
import { useTheme } from '../../../lib/theme';

/** The list screen always sits underneath, so Back from any screen in this tab returns to it. */
export const unstable_settings = { anchor: 'index' };

export default function UrgesLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Urge Tracker', headerRight: () => <SyncIndicator /> }} />
      <Stack.Screen name="breathe" options={{ title: 'Breathe' }} />
      <Stack.Screen name="[id]" options={{ title: 'Urge' }} />
    </Stack>
  );
}
