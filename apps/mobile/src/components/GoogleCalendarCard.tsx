import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import { api, describeError } from '../api/client';
import { syncService } from '../state/sync';
import { Body, Button, Card, ErrorNote, Muted, SectionTitle } from './ui';

interface GoogleStatus {
  available: boolean;
  connected: boolean;
  googleEmail: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

const KEY = ['google-status'];

/** Profile card: connect Google Calendar for two-way block sync. Needs the internet. */
export function GoogleCalendarCard() {
  const qc = useQueryClient();
  const { data, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<{ data: GoogleStatus }>('/google/status')).data.data,
    retry: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Coming back from the browser after connecting: refresh and pull Google's events.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      void refetch().then((r) => {
        if (r.data?.connected) void syncService.syncNow();
      });
    });
    return () => sub.remove();
  }, [refetch]);

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      setProblem(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  const connect = () =>
    run('connect', async () => {
      const url = (await api.post<{ data: { url: string } }>('/google/connect-link')).data.data.url;
      await Linking.openURL(url);
    });

  const syncNow = () =>
    run('sync', async () => {
      const s = (await api.post<{ data: GoogleStatus }>('/google/sync')).data.data;
      qc.setQueryData(KEY, s);
      await syncService.syncNow();
    });

  const disconnect = () =>
    Alert.alert('Disconnect Google Calendar?', 'Blocks stay in the app and events stay in Google; they just stop syncing.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () =>
          void run('disconnect', async () => {
            await api.delete('/google');
            await qc.invalidateQueries({ queryKey: KEY });
          }),
      },
    ]);

  return (
    <Card>
      <SectionTitle>Google Calendar</SectionTitle>
      {error ? (
        <Muted>Connect to the internet to manage Google Calendar.</Muted>
      ) : !data ? (
        <Muted>Checking…</Muted>
      ) : !data.available ? (
        <Muted>Google Calendar sync isn't switched on for this server yet.</Muted>
      ) : data.connected ? (
        <>
          <Body>Connected{data.googleEmail ? ` as ${data.googleEmail}` : ''}.</Body>
          <Muted>
            Blocks sync both ways. {data.lastSyncAt ? `Last synced ${new Date(data.lastSyncAt).toLocaleString()}.` : 'First sync in progress.'}
          </Muted>
          {data.lastError && <ErrorNote message={data.lastError} />}
          <Button title="Sync now" variant="secondary" icon="sync-outline" loading={busy === 'sync'} onPress={() => void syncNow()} />
          {data.lastError?.includes('Connect again') && (
            <Button title="Connect again" icon="logo-google" loading={busy === 'connect'} onPress={() => void connect()} />
          )}
          <Button title="Disconnect" variant="ghost" icon="unlink-outline" loading={busy === 'disconnect'} onPress={disconnect} />
        </>
      ) : (
        <>
          <Muted>
            Show your time blocks in Google Calendar, and events from Google in your Plan timeline. Edits on either side sync
            both ways.
          </Muted>
          <Button title="Connect Google Calendar" icon="logo-google" loading={busy === 'connect'} onPress={() => void connect()} />
        </>
      )}
      {problem && <ErrorNote message={problem} />}
    </Card>
  );
}
