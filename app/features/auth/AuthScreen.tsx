// Sign-up / sign-in screen (Story 1.2).
//
// Deliberately minimal and unstyled — the themed visual shell and bottom nav are
// Story 1.3. This screen exists to exercise the three Google-free auth paths:
//   1. Sign up with email + password (+ @username captured at sign-up)
//   2. Sign in with email + password
//   3. Magic link via one-time code (OTP): request a code by email, then verify
//      it. We use the emailed 6-digit code rather than a deep link — no URL-scheme
//      plumbing needed (that is deferred).
//
// On success, supabase.auth fires onAuthStateChange and App swaps to the signed-in
// view; this screen does not navigate itself.

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '../../data/supabaseClient';
import { USERNAME_RE } from '../../data/auth';

type Mode = 'signin' | 'signup' | 'magic';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
    setOtpSent(false);
    setOtpCode('');
  }

  async function handleSignUp() {
    if (!USERNAME_RE.test(username)) {
      setError('Pick a @username of 3–30 letters, numbers, or underscores.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: username.trim(), display_name: displayName.trim() || username.trim() } },
    });
    setBusy(false);
    if (signUpError) {
      // A colliding @username (or email) makes the profile-creation trigger roll
      // the whole sign-up back. This GoTrue build surfaces that as an unhelpful
      // message (empty / "{}" / a raw DB-constraint string), so show a friendly
      // catch-all for those. Since the @username format is already validated
      // above, a duplicate is the dominant cause. Genuinely informative
      // validation errors (weak password, malformed email) are passed through.
      const raw = signUpError.message ?? '';
      const uninformative = raw.trim() === '' || raw.trim() === '{}' || /database error|duplicate|constraint/i.test(raw);
      setError(
        uninformative
          ? 'Couldn’t create your account — that email or @username may already be in use. Try another.'
          : raw,
      );
    }
    // On success onAuthStateChange takes over (autoconfirm is on in local dev).
  }

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signInError) setError(signInError.message);
  }

  async function handleSendCode() {
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setOtpSent(true);
    setInfo('Check your email for a 6-digit code.');
  }

  async function handleVerifyCode() {
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otpCode.trim(),
      type: 'email',
    });
    setBusy(false);
    if (verifyError) setError(verifyError.message);
    // On success onAuthStateChange swaps the view.
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>TV Time 2</Text>

        <View style={styles.tabs}>
          <ModeTab label="Sign in" active={mode === 'signin'} disabled={busy} onPress={() => switchMode('signin')} />
          <ModeTab label="Sign up" active={mode === 'signup'} disabled={busy} onPress={() => switchMode('signup')} />
          <ModeTab label="Magic link" active={mode === 'magic'} disabled={busy} onPress={() => switchMode('magic')} />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="Email"
        />

        {mode === 'signup' && (
          <>
            <TextInput
              style={styles.input}
              placeholder="@username"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
              accessibilityLabel="Username"
            />
            <TextInput
              style={styles.input}
              placeholder="Display name (optional)"
              value={displayName}
              onChangeText={setDisplayName}
              accessibilityLabel="Display name"
            />
          </>
        )}

        {(mode === 'signin' || mode === 'signup') && (
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            accessibilityLabel="Password"
          />
        )}

        {mode === 'magic' && otpSent && (
          <TextInput
            style={styles.input}
            placeholder="6-digit code"
            keyboardType="number-pad"
            value={otpCode}
            onChangeText={setOtpCode}
            accessibilityLabel="One-time code"
          />
        )}

        {error && <Text style={styles.error}>{error}</Text>}
        {info && <Text style={styles.info}>{info}</Text>}

        {mode === 'signin' && <PrimaryButton label="Sign in" busy={busy} onPress={handleSignIn} />}
        {mode === 'signup' && <PrimaryButton label="Create account" busy={busy} onPress={handleSignUp} />}
        {mode === 'magic' &&
          (otpSent ? (
            <PrimaryButton label="Verify code" busy={busy} onPress={handleVerifyCode} />
          ) : (
            <PrimaryButton label="Email me a code" busy={busy} onPress={handleSendCode} />
          ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ModeTab({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      // Disabled while a request is in flight so a mode switch can't apply a
      // resolving request's result (setError/setBusy) to a different mode.
      disabled={disabled}
      style={[styles.tab, active && styles.tabActive, disabled && !active && styles.tabDisabled]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled }}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.button, busy && styles.buttonDisabled]}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#eee', alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  tabActive: { backgroundColor: '#1a1a2e' },
  tabDisabled: { opacity: 0.5 },
  tabText: { color: '#333', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, minHeight: 48 },
  button: { backgroundColor: '#1a1a2e', borderRadius: 8, paddingVertical: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#b00020' },
  info: { color: '#137333' },
});
