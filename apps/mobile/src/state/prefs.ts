import { create } from 'zustand';
import type { Db } from '../db/types';

/** Device-only preferences, stored in the local `prefs` table (never synced). */
export interface Prefs {
  theme: 'system' | 'light' | 'dark' | 'coffee';
  reminderEnabled: boolean;
  reminderTime: string; // HH:MM
  showUrgesOnDashboard: boolean;
  /** Planner: a notification at each task's time, plus optional morning / evening nudges. */
  planTaskReminders: boolean;
  planMorningEnabled: boolean;
  planMorningTime: string; // HH:MM
  planEveningEnabled: boolean;
  planEveningTime: string; // HH:MM
}

const DEFAULTS: Prefs = {
  theme: 'system',
  reminderEnabled: false,
  reminderTime: '21:00',
  showUrgesOnDashboard: true,
  planTaskReminders: true,
  planMorningEnabled: false,
  planMorningTime: '07:30',
  planEveningEnabled: false,
  planEveningTime: '21:30',
};

let prefsDb: Db | null = null;

export const usePrefs = create<Prefs & { set: (patch: Partial<Prefs>) => Promise<void> }>((set, get) => ({
  ...DEFAULTS,
  set: async (patch) => {
    set(patch);
    if (!prefsDb) return;
    const { set: _s, ...all } = get();
    await prefsDb.run(
      "INSERT INTO prefs (key, value) VALUES ('prefs', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [JSON.stringify(all)],
    );
  },
}));

export async function loadPrefs(db: Db) {
  prefsDb = db;
  const row = await db.get<{ value: string }>("SELECT value FROM prefs WHERE key = 'prefs'");
  if (!row) return;
  try {
    usePrefs.setState({ ...DEFAULTS, ...(JSON.parse(row.value) as Partial<Prefs>) });
  } catch {
    // Ignore corrupt prefs; defaults apply.
  }
}
