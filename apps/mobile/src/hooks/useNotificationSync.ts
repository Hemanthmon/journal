import { useQuery } from '@tanstack/react-query';
import { addDays, toLocalDate } from '@journal/shared';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { listLocal } from '../data/records';
import { ensureOccurrences } from '../data/series';
import { applyNotifications, ensurePermission, hasPermission, remindersSupported } from '../lib/notifications';
import { usePrefs } from '../state/prefs';
import { useCtx } from '../state/session';

/**
 * Keeps the phone's scheduled notifications in line with the prefs and the planner: the
 * task list is a local query, so it refreshes after every local write and every sync.
 */
export function useNotificationSync() {
  const ctx = useCtx();
  const prefs = usePrefs();
  const today = toLocalDate();
  const { data: tasks, refetch } = useQuery({
    queryKey: ['notify-tasks', today],
    enabled: remindersSupported,
    queryFn: async () => {
      // Repeating tasks need their coming days in place to get reminders.
      await ensureOccurrences(ctx, today, addDays(today, 7), today);
      const rows = await listLocal(ctx.db, 'planTasks', {
        where: 'local_time IS NOT NULL AND completed_at IS NULL AND local_date BETWEEN ? AND ?',
        params: [today, addDays(today, 7)],
      });
      return rows.map((t) => ({ localDate: t.localDate, time: t.localTime!.slice(0, 5) }));
    },
  });

  // Past alarms drop off and a new day's tasks come in when the app returns to the front.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  useEffect(() => {
    if (!tasks) return;
    const wantTasks = prefs.planTaskReminders && tasks.length > 0;
    void (async () => {
      // The first timed task is the natural moment to ask ("you'll get a reminder").
      if (wantTasks && !(await hasPermission())) await ensurePermission();
      await applyNotifications({
        journal: prefs.reminderEnabled ? prefs.reminderTime : null,
        planMorning: prefs.planMorningEnabled ? prefs.planMorningTime : null,
        planEvening: prefs.planEveningEnabled ? prefs.planEveningTime : null,
        tasks: prefs.planTaskReminders ? tasks : [],
      });
    })().catch(() => {
      // Scheduling is best effort; the planner works without it.
    });
  }, [
    tasks,
    prefs.reminderEnabled,
    prefs.reminderTime,
    prefs.planTaskReminders,
    prefs.planMorningEnabled,
    prefs.planMorningTime,
    prefs.planEveningEnabled,
    prefs.planEveningTime,
  ]);
}
