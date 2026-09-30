import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { describeError } from '../../api/client';
import { Body, Button, Card, ErrorNote, Field, Muted, Screen, Title } from '../../components/ui';
import { space, useTheme } from '../../lib/theme';
import { useSession } from '../../state/session';

export default function Register() {
  const register = useSession((s) => s.register);
  const { c } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await register(name.trim(), email.trim(), password);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ gap: space.sm, marginTop: space.xxl }}>
        <Title style={{ fontSize: 30 }}>Create your account</Title>
        <Muted>Everything you write is saved on your phone first and synced privately to your account.</Muted>
      </View>
      <Card>
        <Field label="Name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Field
          label="Password"
          hint="At least 8 characters"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {error && <ErrorNote message={error} />}
        <Button
          title="Create account"
          onPress={submit}
          loading={busy}
          disabled={!name.trim() || !email || password.length < 8}
        />
      </Card>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.xs }}>
        <Body>Already have an account?</Body>
        <Link href="/login" style={{ color: c.primary, fontWeight: '600', fontSize: 16 }}>
          Log in
        </Link>
      </View>
    </Screen>
  );
}
