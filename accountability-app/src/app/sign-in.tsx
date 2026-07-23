import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { validateEmail, validatePassword } from '../auth/validation';
import { authErrorMessage, isUnconfirmed } from '../auth/errors';
import { AuthShell } from '../ui/AuthShell';
import { Button } from '../ui/Button';
import { colors, font, radius, spacing } from '../ui/theme';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError || passwordError) {
      Alert.alert('Check your details', emailError ?? passwordError ?? '');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (!error) return;
    if (isUnconfirmed(error.message)) {
      // Never confirmed → send a fresh code and take them to the verify screen.
      supabase.auth.resend({ type: 'signup', email: email.trim() }).catch(() => {});
      router.push({ pathname: '/verify-email', params: { email: email.trim() } });
      return;
    }
    Alert.alert('Could not log in', authErrorMessage(error.message));
  }

  return (
    <AuthShell>
      <Text style={styles.title}>Welcome back</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
      />
      <View style={styles.pwWrap}>
        <TextInput
          style={styles.pwInput}
          placeholder="Password"
          placeholderTextColor={colors.textFaint}
          secureTextEntry={!showPw}
          autoComplete="current-password"
          textContentType="password"
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          onPress={() => setShowPw((s) => !s)}
          hitSlop={8}
          style={styles.eye}
          accessibilityLabel={showPw ? 'Hide password' : 'Show password'}
        >
          <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
        </Pressable>
      </View>
      <Text style={styles.forgot} onPress={() => router.push('/forgot-password')}>
        Forgot password?
      </Text>
      <Button title="Log in" onPress={onSignIn} loading={busy} style={styles.button} />
      <Link href="/sign-up" style={styles.link}>
        No account yet? Sign up
      </Link>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontFamily: font.extrabold, color: colors.text, marginBottom: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 14,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  pwWrap: { position: 'relative', justifyContent: 'center' },
  pwInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 14,
    paddingRight: 48,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  eye: { position: 'absolute', right: 8, height: 44, width: 40, alignItems: 'center', justifyContent: 'center' },
  forgot: {
    textAlign: 'right',
    color: colors.primary,
    fontFamily: font.medium,
    fontSize: 13.5,
    marginTop: -2,
  },
  button: { marginTop: spacing.xs },
  link: {
    textAlign: 'center',
    color: colors.primary,
    fontFamily: font.medium,
    marginTop: spacing.sm,
  },
});
