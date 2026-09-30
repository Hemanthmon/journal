import { router } from 'expo-router';
import { useState } from 'react';
import { describeError } from '../../../api/client';
import { Button, Card, ErrorNote, Field, Muted, Screen } from '../../../components/ui';
import { useSession } from '../../../state/session';

/** Signs in again as the same user without touching local data, so unsynced entries are kept. */
export default function Reauth() {
  const user = useSession((s) => s.user);
  const login = useSession((s) => s.login);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await login(user.email, password);
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
        <Muted>Your session expired. Sign in to resume syncing — nothing on this device will be lost.</Muted>
        <Field label="Email" value={user?.email ?? ''} editable={false} />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
        {error && <ErrorNote message={error} />}
        <Button title="Sign in" onPress={submit} loading={busy} disabled={!password} />
      </Card>
    </Screen>
  );
}
