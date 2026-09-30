import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

/**
 * A single local daily reminder to write the journal. No push notifications, no server.
 *
 * expo-notifications throws as soon as it is loaded inside Expo Go on Android (SDK 53+),
 * so it is required lazily and reminders are unavailable there. They work in Expo Go on
 * iOS and in development/production builds.
 */
export const remindersSupported = !(Platform.OS === 'android' && isRunningInExpoGo());

type NotificationsModule = typeof import('expo-notifications');
let mod: NotificationsModule | null = null;

function load(): NotificationsModule | null {
  if (!remindersSupported) return null;
  if (!mod) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
  return mod;
}

export async function scheduleReminder(time: string): Promise<boolean> {
  const N = load();
  if (!N) return false;
  const { status } = await N.requestPermissionsAsync();
  if (status !== 'granted') return false;
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('reminders', {
      name: 'Daily reminder',
      importance: N.AndroidImportance.DEFAULT,
    });
  }
  await N.cancelAllScheduledNotificationsAsync();
  const [hour, minute] = time.split(':').map(Number);
  await N.scheduleNotificationAsync({
    // Deliberately generic: nothing personal appears on the lock screen.
    content: { title: 'Daily routine', body: 'A few minutes for your routine and reflection?' },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DAILY,
      hour: hour ?? 21,
      minute: minute ?? 0,
      channelId: 'reminders',
    },
  });
  return true;
}

export async function cancelReminder(): Promise<void> {
  await load()?.cancelAllScheduledNotificationsAsync();
}
