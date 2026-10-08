import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { describeError } from '../../api/client';
import { AuthHero } from '../../components/AuthHero';
import { Button, ErrorNote, Field } from '../../components/ui';
import { useSystemInsets } from '../../hooks/useSystemInsets';
import { font, radius, space, useTheme } from '../../lib/theme';
import { useSession } from '../../state/session';

export default function Login() {
  const login = useSession((s) => s.login);
  const { c } = useTheme();
  const insets = useSystemInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password) return;
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + space.xl }}>
        <AuthHero title="Welcome back" subtitle="Small steps, every day. Your journal is waiting for you." />

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
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <View>
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry={!show}
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={submit}
              returnKeyType="go"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={show ? 'Hide password' : 'Show password'}
              hitSlop={10}
              onPress={() => setShow((s) => !s)}
              style={{ position: 'absolute', right: space.md, top: 34 }}
            >
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={22} color={c.muted} />
            </Pressable>
          </View>
          {error && <ErrorNote message={error} />}
          <Button title="Log in" icon="leaf-outline" onPress={submit} loading={busy} disabled={!email || !password} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Ionicons name="lock-closed-outline" size={14} color={c.muted} />
            <Text style={{ color: c.muted, fontSize: font.small, flex: 1 }}>Private to you. Works offline once you're in.</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.xs, marginTop: space.xl }}>
          <Text style={{ color: c.muted, fontSize: font.body }}>New here?</Text>
          <Link href="/register" style={{ color: c.primary, fontWeight: '700', fontSize: font.body }}>
            Create an account
          </Link>
        </View>

        <Text
          style={{
            color: c.muted,
            fontSize: font.small,
            fontStyle: 'italic',
            textAlign: 'center',
            marginTop: space.xl,
            marginHorizontal: space.xxl,
            lineHeight: 19,
          }}
        >
          "Every action you take is a vote for the type of person you wish to become." — James Clear
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
