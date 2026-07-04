import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../lib/supabase';
import { validateEmail, validatePassword } from '../auth/validation';
import { AuthShell } from '../ui/AuthShell';
import { Button } from '../ui/Button';
import { colors, font, radius, spacing } from '../ui/theme';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError || passwordError) {
      Alert.alert('Check your details', emailError ?? passwordError ?? '');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) Alert.alert('Could not sign in', error.message);
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
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.textFaint}
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
      />
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
  button: { marginTop: spacing.xs },
  link: {
    textAlign: 'center',
    color: colors.primary,
    fontFamily: font.medium,
    marginTop: spacing.sm,
  },
});
