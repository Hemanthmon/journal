import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { describeError } from '../../api/client';
import { Body, Button, Card, ErrorNote, Field, Muted, Screen, Title } from '../../components/ui';
import { space, useTheme } from '../../lib/theme';
import { useSession } from '../../state/session';

export default function Login() {
  const login = useSession((s) => s.login);
  const { c } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ gap: space.sm, marginTop: space.xxl }}>
        <Title style={{ fontSize: 30 }}>Welcome back</Title>
        <Muted>Your routine, journal and notes — private to you.</Muted>
      </View>
      <Card>
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
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        {error && <ErrorNote message={error} />}
        <Button title="Log in" onPress={submit} loading={busy} disabled={!email || !password} />
      </Card>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.xs }}>
        <Body>New here?</Body>
        <Link href="/register" style={{ color: c.primary, fontWeight: '600', fontSize: 16 }}>
          Create an account
        </Link>
      </View>
    </Screen>
  );
}
