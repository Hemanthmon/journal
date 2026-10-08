import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { describeError } from '../../api/client';
import { AuthHero } from '../../components/AuthHero';
import { Button, ErrorNote, Field } from '../../components/ui';
import { useSystemInsets } from '../../hooks/useSystemInsets';
import { font, radius, space, useTheme } from '../../lib/theme';
import { useSession } from '../../state/session';

export default function Register() {
  const register = useSession((s) => s.register);
  const { c } = useTheme();
  const insets = useSystemInsets();
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + space.xl }}>
        <AuthHero title="Begin gently" subtitle="A private place for your habits, thoughts and growth." height={260} />
        <View
          style={{
            marginTop: -40,
            marginHorizontal: space.lg,
            backgroundColor: c.card,
            borderRadius: radius.lg + 4,
            padding: space.xl,
            gap: space.lg,
            shadowColor: '#1F3D2E',
            shadowOpacity: 0.12,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
          }}
        >
          <Field label="Name" value={name} onChangeText={setName} placeholder="What should we call you?" autoComplete="name" textContentType="name" />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
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
            icon="leaf-outline"
            onPress={submit}
            loading={busy}
            disabled={!name.trim() || !email || password.length < 8}
          />
          <Text style={{ color: c.muted, fontSize: font.small }}>
            Saved on your phone first, then synced privately to your account.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.xs, marginTop: space.xl }}>
          <Text style={{ color: c.muted, fontSize: font.body }}>Already have an account?</Text>
          <Link href="/login" style={{ color: c.primary, fontWeight: '700', fontSize: font.body }}>
            Log in
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
