import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs, router } from 'expo-router';
import { View } from 'react-native';
import { BreathFab } from '../../components/BreathFab';
import { SyncIndicator } from '../../components/widgets';
import { useSystemInsets } from '../../hooks/useSystemInsets';
import { useTheme } from '../../lib/theme';
import { useSession } from '../../state/session';

export default function TabsLayout() {
  const status = useSession((s) => s.status);
  const { c } = useTheme();
  const insets = useSystemInsets();
  if (status !== 'signedIn') return <Redirect href="/login" />;

  const headerRight = () => <SyncIndicator onPress={() => router.navigate('/profile')} />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        // Keep the tab bar above the Android navigation/gesture bar and the iPhone home indicator.
        safeAreaInsets={insets}
        screenOptions={{
          tabBarActiveTintColor: c.primary,
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
            tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="routine"
          options={{
            title: 'Daily Routine',
            tabBarIcon: ({ color, size }) => <Ionicons name="sunny-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="urges"
          options={{
            title: 'Urge Tracker',
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Ionicons name="pulse-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={color} size={size} />,
          }}
        />
      </Tabs>
      {/* One tap to the breathing exercise from any main screen. */}
      <BreathFab />
    </View>
  );
}
