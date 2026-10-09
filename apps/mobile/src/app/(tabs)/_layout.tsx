import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs, router } from 'expo-router';
import { View, type ColorValue } from 'react-native';
import { BreathFab } from '../../components/BreathFab';
import { SyncIndicator } from '../../components/widgets';
import { useNotificationSync } from '../../hooks/useNotificationSync';
import { useSystemInsets } from '../../hooks/useSystemInsets';
import { useTheme } from '../../lib/theme';
import { useSession } from '../../state/session';

type IconBase = 'home' | 'sunny' | 'leaf' | 'pulse' | 'person-circle';

/** Filled icon in a soft pill for the screen you're on; outline elsewhere. */
function TabIcon({ name, focused, color, size }: { name: IconBase; focused: boolean; color: ColorValue; size: number }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: 56,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? c.primarySoft : 'transparent',
      }}
    >
      <Ionicons name={focused ? name : `${name}-outline`} color={color as string} size={focused ? size : size - 2} />
    </View>
  );
}

export default function TabsLayout() {
  const status = useSession((s) => s.status);
  if (status !== 'signedIn') return <Redirect href="/login" />;
  return <SignedInTabs />;
}

function SignedInTabs() {
  const { c } = useTheme();
  const insets = useSystemInsets();
  useNotificationSync();

  const headerRight = () => <SyncIndicator onPress={() => router.navigate('/profile')} />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        // Keep the tab bar above the Android navigation/gesture bar and the iPhone home indicator.
        safeAreaInsets={insets}
        screenOptions={{
          tabBarActiveTintColor: c.primary,
          // The current screen's icon is filled inside a soft pill (see TabIcon).
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarInactiveTintColor: c.muted,
          tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
          headerStyle: { backgroundColor: c.bg },
          headerStatusBarHeight: insets.top,
          headerShadowVisible: false,
          headerTintColor: c.text,
          headerRight,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: (p) => <TabIcon name="home" {...p} />,
          }}
        />
        <Tabs.Screen
          name="routine"
          options={{
            title: 'Daily Routine',
            tabBarIcon: (p) => <TabIcon name="sunny" {...p} />,
          }}
        />
        <Tabs.Screen
          name="plan"
          options={{
            title: 'Plan',
            headerShown: false,
            tabBarIcon: (p) => <TabIcon name="leaf" {...p} />,
          }}
        />
        <Tabs.Screen
          name="urges"
          options={{
            title: 'Urge Tracker',
            headerShown: false,
            tabBarIcon: (p) => <TabIcon name="pulse" {...p} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            headerShown: false,
            tabBarIcon: (p) => <TabIcon name="person-circle" {...p} />,
          }}
        />
      </Tabs>
      {/* One tap to the breathing exercise from any main screen. */}
      <BreathFab />
    </View>
  );
}
