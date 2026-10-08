import { Stack } from 'expo-router';
import { StackHeader } from '../../../components/StackHeader';
import { SyncIndicator } from '../../../components/widgets';
import { useTheme } from '../../../lib/theme';

/** The planner sits underneath, so Back from any screen in this tab returns to it. */
export const unstable_settings = { anchor: 'index' };

export default function PlanLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Plan', headerRight: () => <SyncIndicator /> }} />
      <Stack.Screen name="task" options={{ title: 'Task' }} />
      <Stack.Screen name="identities" options={{ title: "Who I'm becoming" }} />
      <Stack.Screen name="review" options={{ title: 'Review' }} />
    </Stack>
  );
}
