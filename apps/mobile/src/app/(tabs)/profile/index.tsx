import { router } from 'expo-router';
import { formatTime12 } from '@journal/shared';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { SessionBanner } from '../../../components/SessionBanner';
import { Body, Button, Card, Chip, Divider, ErrorNote, LinkRow, Muted, Screen, SectionTitle, Segmented, ToggleRow } from '../../../components/ui';
import { exportHabitsCsv, exportHabitDefinitionsCsv, exportJournalCsv, exportUrgesCsv } from '../../../data/exporter';
import { describeError } from '../../../api/client';
import { shareCsv } from '../../../lib/exportFiles';
import { cancelReminder, remindersSupported, scheduleReminder } from '../../../lib/notifications';
import { space } from '../../../lib/theme';
import { usePrefs } from '../../../state/prefs';
import { useCtx, useSession } from '../../../state/session';
import { syncService, useSyncStore } from '../../../state/sync';

const REMINDER_TIMES = ['08:00', '12:00', '19:00', '21:00', '22:00'];

function timeAgo(iso: string | null) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
}

export default function Profile() {
  const ctx = useCtx();
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const sync = useSyncStore((s) => s.state);
  const prefs = usePrefs();
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const confirmLogout = () => {
    const pending = sync.pending;
    Alert.alert(
      'Log out?',
      pending > 0
        ? `${pending} change${pending === 1 ? " hasn't" : "s haven't"} synced yet and will be lost. Connect to the internet and sync first to keep ${pending === 1 ? 'it' : 'them'}.`
        : 'Your data stays in your account. It will be removed from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        ...(pending > 0 ? [{ text: 'Sync now', onPress: () => void syncService.syncNow() }] : []),
        { text: pending > 0 ? 'Log out anyway' : 'Log out', style: 'destructive' as const, onPress: () => void logout() },
      ],
    );
  };

  const doExport = async (kind: string, build: () => Promise<string>, filename: string) => {
    setError(null);
    setExporting(kind);
    try {
      await shareCsv(filename, await build());
    } catch (e) {
      setError(describeError(e));
    } finally {
      setExporting(null);
    }
  };

  const setReminder = async (enabled: boolean, time = prefs.reminderTime) => {
    setError(null);
    if (enabled) {
      const ok = await scheduleReminder(time);
      if (!ok) {
        setError('Notifications are turned off for this app in your phone settings.');
        return;
      }
    } else {
      await cancelReminder();
    }
    await prefs.set({ reminderEnabled: enabled, reminderTime: time });
  };

  const syncText =
    sync.phase === 'syncing'
      ? 'Syncing…'
      : sync.phase === 'offline'
        ? 'Offline — changes are saved on this device'
        : sync.phase === 'error'
          ? `Sync failed: ${sync.lastError ?? 'unknown error'}`
          : sync.pending > 0
            ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting to sync`
            : 'Everything is synced';

  return (
    <Screen>
      <SessionBanner />
      {error && <ErrorNote message={error} />}

      <Card>
        <SectionTitle>Account</SectionTitle>
        <Body style={{ fontWeight: '600' }}>{user?.name}</Body>
        <Muted>{user?.email}</Muted>
        <Divider />
        <LinkRow icon="create-outline" label="Edit profile" onPress={() => router.push('/profile/account')} />
        <LinkRow icon="log-out-outline" label="Log out" onPress={confirmLogout} />
      </Card>

      <Card>
        <SectionTitle>Sync</SectionTitle>
        <Body>{syncText}</Body>
        <Muted>Last synced {timeAgo(sync.lastSyncedAt)}</Muted>
        {sync.rejected > 0 && (
          <Muted>{sync.rejected} change{sync.rejected === 1 ? " couldn't" : "s couldn't"} be saved to the server and remain on this device only.</Muted>
        )}
        {sync.conflicts > 0 && (
          <LinkRow
            icon="git-compare-outline"
            label="Journal edits to review"
            detail={String(sync.conflicts)}
            onPress={() => router.push('/profile/conflicts')}
          />
        )}
        <Button title="Sync now" variant="secondary" icon="sync-outline" onPress={() => void syncService.syncNow()} />
      </Card>

      <Card>
        <SectionTitle>Daily Routine Settings</SectionTitle>
        <LinkRow icon="checkmark-done-outline" label="Manage habits" onPress={() => router.push('/profile/habits')} />
        <LinkRow icon="chatbubbles-outline" label="Manage questions" onPress={() => router.push('/profile/questions')} />
        <LinkRow icon="sparkles-outline" label="Daily reminders" onPress={() => router.push('/profile/reminders')} />
      </Card>

      <Card>
        <SectionTitle>Urge Tracker Settings</SectionTitle>
        <LinkRow icon="happy-outline" label="Manage emotions" onPress={() => router.push('/profile/emotions')} />
      </Card>

      <Card>
        <SectionTitle>History</SectionTitle>
        <LinkRow icon="calendar-outline" label="Daily routine history" onPress={() => router.push('/profile/history')} />
        <LinkRow icon="stats-chart-outline" label="Habit history" onPress={() => router.push('/profile/habit-history')} />
        <LinkRow icon="pulse-outline" label="Urge history" onPress={() => router.navigate('/urges')} />
      </Card>

      <Card>
        <SectionTitle>Data</SectionTitle>
        <Muted>Exports are CSV files (open in Excel, Numbers or Google Sheets), created from the data on this device.</Muted>
        <View style={{ gap: space.sm }}>
          <Button
            title="Export journal"
            variant="secondary"
            icon="download-outline"
            loading={exporting === 'journal'}
            onPress={() => doExport('journal', () => exportJournalCsv(ctx), 'journal.csv')}
          />
          <Button
            title="Export habit logs"
            variant="secondary"
            icon="download-outline"
            loading={exporting === 'logs'}
            onPress={() => doExport('logs', () => exportHabitsCsv(ctx), 'habit-logs.csv')}
          />
          <Button
            title="Export habit list"
            variant="secondary"
            icon="download-outline"
            loading={exporting === 'habits'}
            onPress={() => doExport('habits', () => exportHabitDefinitionsCsv(ctx), 'habits.csv')}
          />
          <Button
            title="Export urge records"
            variant="secondary"
            icon="download-outline"
            loading={exporting === 'urges'}
            onPress={() => doExport('urges', () => exportUrgesCsv(ctx), 'urge-records.csv')}
          />
        </View>
        <Divider />
        <LinkRow icon="trash-outline" label="Delete personal data or account" danger onPress={() => router.push('/profile/data')} />
      </Card>

      <Card>
        <SectionTitle>Settings</SectionTitle>
        <Body style={{ fontWeight: '600' }}>Notifications</Body>
        {remindersSupported ? (
          <ToggleRow
            label="Daily notification"
            hint="A gentle, generic nudge to open the app. Nothing personal is shown on the lock screen."
            value={prefs.reminderEnabled}
            onChange={(v) => void setReminder(v)}
          />
        ) : (
          <Muted>Daily notifications aren't available in Expo Go on Android. They work in the installed app.</Muted>
        )}
        {remindersSupported && prefs.reminderEnabled && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {REMINDER_TIMES.map((t) => (
              <Chip key={t} label={formatTime12(t)} selected={prefs.reminderTime === t} onPress={() => void setReminder(true, t)} />
            ))}
          </View>
        )}
        <Divider />
        <Body style={{ fontWeight: '600' }}>Privacy</Body>
        <ToggleRow
          label="Show urge summary on Dashboard"
          hint="Turn off to keep the urge tracker out of view when others can see your screen."
          value={prefs.showUrgesOnDashboard}
          onChange={(v) => void prefs.set({ showUrgesOnDashboard: v })}
        />
        <Muted>
          On this device: your entries are stored in the app's private storage so they work offline; your sign-in is kept
          in the phone's secure keychain. On the server: your account and synced entries, readable only with your login.
          Logging out removes your data from this device.
        </Muted>
        <Divider />
        <Body style={{ fontWeight: '600' }}>Theme</Body>
        <Segmented
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={prefs.theme}
          onChange={(v) => void prefs.set({ theme: v })}
        />
      </Card>
    </Screen>
  );
}
