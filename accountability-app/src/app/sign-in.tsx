import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../lib/supabase';
import { validateEmail, validatePassword } from '../auth/validation';
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
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.textFaint}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button title="Log in" onPress={onSignIn} loading={busy} style={styles.button} />
      <Link href="/sign-up" style={styles.link}>
        No account yet? Sign up
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  title: { fontSize: 28, fontFamily: font.bold, color: colors.text, marginBottom: spacing.md },
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
