import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import type { DashboardViewer } from '@journal/shared';
import { api, describeError } from '../../../api/client';
import { Body, Button, Card, Divider, EmptyState, ErrorNote, Field, IconButton, Loading, Muted, Screen, SectionTitle } from '../../../components/ui';
import { API_URL } from '../../../lib/config';
import { space, useTheme } from '../../../lib/theme';

const KEY = ['dashboard-viewers'];

async function fetchViewers(): Promise<DashboardViewer[]> {
  return (await api.get<{ data: DashboardViewer[] }>('/dashboard-access')).data.data;
}

export default function Sharing() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { data, isLoading, error: loadError, refetch } = useQuery({ queryKey: KEY, queryFn: fetchViewers });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (isLoading) return <Loading />;

  const share = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<{ data: DashboardViewer }>('/dashboard-access', { name: name.trim(), email: email.trim() });
      const firstName = name.trim().split(/\s+/)[0];
      setNotice(
        res.status === 201
          ? `${firstName} can now see your dashboard. We've emailed them an invitation.`
          : `Updated ${firstName}'s name. They already had access.`,
      );
      setName('');
      setEmail('');
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (v: DashboardViewer) => {
    Alert.alert(`Remove ${v.name ?? v.email}?`, "They'll be signed out of your dashboard straight away.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setError(null);
          setNotice(null);
          try {
            await api.delete(`/dashboard-access/${v.id}`);
            await qc.invalidateQueries({ queryKey: KEY });
          } catch (e) {
            setError(describeError(e));
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <Muted>
        Pick people who can follow your progress on the web dashboard. They see your habits, moods, journal and urge
        records, but can&apos;t change anything. They sign in with a code sent to their email.
      </Muted>

      <Card>
        <SectionTitle>Share with someone</SectionTitle>
        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Priya" maxLength={100} autoCapitalize="words" />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={255}
        />
        {error && <ErrorNote message={error} />}
        {notice && <Body style={{ color: c.success }}>{notice}</Body>}
        <Button title="Give access" icon="person-add-outline" onPress={share} loading={busy} disabled={!name.trim() || !email.trim()} />
        <Muted>Needs an internet connection.</Muted>
      </Card>

      <Card>
        <SectionTitle>People with access</SectionTitle>
        {loadError ? (
          <>
            <ErrorNote message={describeError(loadError)} />
            <Button title="Try again" variant="secondary" icon="refresh" onPress={() => void refetch()} />
          </>
        ) : !data || data.length === 0 ? (
          <EmptyState icon="people-outline" title="Only you, for now" message="Add someone above to let them cheer you on." />
        ) : (
          data.map((v, i) => (
            <View key={v.id} style={{ gap: space.sm }}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '600' }}>{v.name ?? v.email}</Body>
                  {v.name && <Muted>{v.email}</Muted>}
                  <Muted>
                    {v.managedByServer ? 'Set in the server settings' : `Since ${new Date(v.grantedAt).toLocaleDateString()}`}
                  </Muted>
                </View>
                {!v.managedByServer && (
                  <IconButton icon="trash-outline" label={`Remove ${v.name ?? v.email}`} color={c.danger} onPress={() => remove(v)} />
                )}
              </View>
            </View>
          ))
        )}
      </Card>

      <Muted>Dashboard address: {API_URL.replace(/\/$/, '')}/</Muted>
    </Screen>
  );
}
