import { router } from 'expo-router';
import { useState } from 'react';
import type { PublicUser } from '@journal/shared';
import { api, describeError } from '../../../api/client';
import { Button, Card, ErrorNote, Field, Muted, Screen } from '../../../components/ui';
import { useSession } from '../../../state/session';

export default function Account() {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const [name, setName] = useState(user?.name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.patch<{ data: PublicUser }>('/profile', { name: name.trim(), timezone: timezone.trim() });
      await setUser(res.data.data);
      router.back();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Email" value={user?.email ?? ''} editable={false} hint="Email can't be changed yet." />
        <Field
          label="Time zone"
          value={timezone}
          onChangeText={setTimezone}
          autoCapitalize="none"
          hint="e.g. Asia/Kolkata. Daily entries always use your phone's local date."
        />
        <Muted>Profile changes need an internet connection.</Muted>
        {error && <ErrorNote message={error} />}
        <Button title="Save" onPress={save} loading={busy} disabled={!name.trim()} />
      </Card>
    </Screen>
  );
}
