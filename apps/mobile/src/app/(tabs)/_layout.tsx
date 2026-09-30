import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs, router } from 'expo-router';
import { SyncIndicator } from '../../components/widgets';
import { useTheme } from '../../lib/theme';
import { useSession } from '../../state/session';

export default function TabsLayout() {
  const status = useSession((s) => s.status);
  const { c } = useTheme();
  if (status !== 'signedIn') return <Redirect href="/login" />;

  const headerRight = () => <SyncIndicator onPress={() => router.navigate('/profile')} />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.bg },
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
  );
}
