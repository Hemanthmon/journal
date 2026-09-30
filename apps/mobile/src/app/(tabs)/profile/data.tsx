import { useState } from 'react';
import { Alert } from 'react-native';
import { api, describeError } from '../../../api/client';
import { Body, Button, Card, ErrorNote, Field, Muted, Screen, SectionTitle } from '../../../components/ui';
import { wipeUserData } from '../../../db/schema';
import { setKv } from '../../../data/records';
import { refreshLocalQueries } from '../../../lib/queryClient';
import { useCtx, useSession } from '../../../state/session';
import { syncService } from '../../../state/sync';

/** Deleting data needs the server (so it's removed everywhere) and the current password. */
export default function DeleteData() {
  const ctx = useCtx();
  const logout = useSession((s) => s.logout);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'data' | 'account' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const deleteData = () =>
    Alert.alert(
      'Delete all personal data?',
      'All habits, logs, journal entries and urge records will be permanently deleted from the server and all your devices. Your account stays. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setBusy('data');
            setError(null);
            try {
              await api.delete('/account/data', { data: { password } });
              await wipeUserData(ctx.db);
              await setKv(ctx.db, 'owner', ctx.userId);
              refreshLocalQueries();
              await syncService.syncNow();
              setPassword('');
              setDone('Your personal data was deleted. Default questions were restored.');
            } catch (e) {
              setError(describeError(e));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );

  const deleteAccount = () =>
    Alert.alert(
      'Delete your account?',
      'Your account and all its data will be permanently deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setBusy('account');
            setError(null);
            try {
              await api.delete('/account', { data: { password } });
              await logout();
            } catch (e) {
              setError(describeError(e));
              setBusy(null);
            }
          },
        },
      ],
    );

  return (
    <Screen>
      <Card>
        <SectionTitle>Confirm with your password</SectionTitle>
        <Muted>These actions need an internet connection so your data is removed from the server too.</Muted>
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
        {error && <ErrorNote message={error} />}
        {done && <Body>{done}</Body>}
      </Card>
      <Card>
        <SectionTitle>Delete personal data</SectionTitle>
        <Muted>Removes every habit, log, journal entry and urge record. Keeps your login.</Muted>
        <Button title="Delete personal data" variant="danger" onPress={deleteData} disabled={!password} loading={busy === 'data'} />
      </Card>
      <Card>
        <SectionTitle>Delete account</SectionTitle>
        <Muted>Removes your account and everything in it.</Muted>
        <Button title="Delete account" variant="danger" onPress={deleteAccount} disabled={!password} loading={busy === 'account'} />
      </Card>
    </Screen>
  );
}
