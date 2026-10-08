import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

/**
 * Local notifications only: no push, no server. Everything the app wants scheduled is
 * described by one `NotificationPlan`, and `applyNotifications` makes the phone match it
 * (cancel all, then schedule), so nothing is ever left behind or duplicated.
 *
 * Texts are deliberately generic: nothing personal appears on the lock screen.
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

export interface NotificationPlan {
  /** "HH:MM" daily times, or null when off. */
  journal: string | null;
  planMorning: string | null;
  planEvening: string | null;
  /** Local date + "HH:MM" of each upcoming, unfinished planned task. */
  tasks: { localDate: string; time: string }[];
}

/** iOS keeps at most 64 pending notifications; leave room for the daily ones. */
const MAX_TASK_ALERTS = 50;

export async function hasPermission(): Promise<boolean> {
  const N = load();
  if (!N) return false;
  return (await N.getPermissionsAsync()).status === 'granted';
}

/** Asks for permission if needed. False if notifications are off or unavailable. */
export async function ensurePermission(): Promise<boolean> {
  const N = load();
  if (!N) return false;
  const { status } = await N.requestPermissionsAsync();
  return status === 'granted';
}

let lastApplied = '';

/** Makes the scheduled notifications match `plan`. Never prompts for permission. */
export async function applyNotifications(plan: NotificationPlan, now = new Date()): Promise<void> {
  const N = load();
  if (!N || !(await hasPermission())) return;

  const taskTimes = plan.tasks
    .map((t) => new Date(`${t.localDate}T${t.time}:00`))
    .filter((d) => d.getTime() > now.getTime() + 30_000)
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, MAX_TASK_ALERTS);
  const signature = JSON.stringify([plan.journal, plan.planMorning, plan.planEvening, taskTimes.map((d) => d.getTime())]);
  if (signature === lastApplied) return;

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('reminders', { name: 'Reminders', importance: N.AndroidImportance.DEFAULT });
  }
  await N.cancelAllScheduledNotificationsAsync();

  const daily = async (time: string, title: string, body: string) => {
    const [hour, minute] = time.split(':').map(Number);
    await N.scheduleNotificationAsync({
      content: { title, body },
      trigger: { type: N.SchedulableTriggerInputTypes.DAILY, hour: hour ?? 9, minute: minute ?? 0, channelId: 'reminders' },
    });
  };
  if (plan.journal) await daily(plan.journal, 'Daily routine', 'A few minutes for your routine and reflection?');
  if (plan.planMorning) await daily(plan.planMorning, 'Plan your day', "One small step toward who you're becoming?");
  if (plan.planEvening) await daily(plan.planEvening, 'Evening check-in', "Tick off what you did today. Every win is a vote.");
  for (const date of taskTimes) {
    await N.scheduleNotificationAsync({
      content: { title: 'Planned for now', body: 'Time for something you planned. Even 2 minutes counts.' },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date, channelId: 'reminders' },
    });
  }
  lastApplied = signature;
}

export async function cancelAllNotifications(): Promise<void> {
  lastApplied = '';
  await load()?.cancelAllScheduledNotificationsAsync();
}
