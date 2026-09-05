import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import { validateEmail, validatePassword } from '../auth/validation';
import { authErrorMessage } from '../auth/errors';
import { AuthShell } from '../ui/AuthShell';
import { Button } from '../ui/Button';
import { font, radius, spacing, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

export default function ForgotPassword() {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSendCode() {
    const err = validateEmail(email);
    if (err) {
      Alert.alert('Check your email', err);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    // Always advance (don't reveal whether an email exists) unless it's a rate limit.
    if (error && /rate|too many|security/i.test(error.message)) {
      Alert.alert('Please wait', authErrorMessage(error.message));
      return;
    }
    setStep('reset');
  }

  async function onReset() {
    const pwErr = validatePassword(password);
    if (code.trim().length < 6 || pwErr) {
      Alert.alert('Almost there', pwErr ?? 'Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    const { error: otpErr } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'recovery',
    });
    if (otpErr) {
      setBusy(false);
      Alert.alert('Couldn’t verify', authErrorMessage(otpErr.message));
      return;
    }
    const { error: pwUpdateErr } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (pwUpdateErr) {
      Alert.alert('Couldn’t update password', authErrorMessage(pwUpdateErr.message));
      return;
    }
    // Recovery created a session → they're signed in with the new password.
    Alert.alert('Password updated', 'You’re all set — welcome back!');
  }

  return (
    <AuthShell>
      {step === 'email' ? (
        <>
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.sub}>Enter your email and we’ll send you a 6-digit reset code.</Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={theme.ink.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <Button title="Send reset code" onPress={onSendCode} loading={busy} style={styles.button} />
        </>
      ) : (
        <>
          <Text style={styles.title}>Enter your code</Text>
          <Text style={styles.sub}>
            We emailed a code to <Text style={styles.email}>{email.trim()}</Text>. Enter it and
            choose a new password.
          </Text>
          <TextInput
            style={styles.codeInput}
            placeholder="6-digit code"
            placeholderTextColor={theme.ink.muted}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
          />
          <View style={styles.pwWrap}>
            <TextInput
              style={styles.pwInput}
              placeholder="New password (8+ characters)"
              placeholderTextColor={theme.ink.muted}
              secureTextEntry={!showPw}
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
            />
            <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={8} style={styles.eye}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.ink.muted} />
            </Pressable>
          </View>
          <Button title="Update password" onPress={onReset} loading={busy} style={styles.button} />
        </>
      )}
      <Text style={styles.back} onPress={() => router.replace('/sign-in')}>
        Back to log in
      </Text>
    </AuthShell>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  title: { fontSize: 24, fontFamily: font.extrabold, color: theme.ink.primary },
  sub: { fontSize: 14.5, fontFamily: font.regular, color: theme.ink.muted, lineHeight: 21, marginBottom: spacing.xs },
  email: { fontFamily: font.bold, color: theme.ink.primary },
  input: {
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: radius.sm,
    padding: 14,
    fontSize: 16,
    fontFamily: font.regular,
    color: theme.ink.primary,
    backgroundColor: theme.surface.raised,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: radius.sm,
    padding: 14,
    fontSize: 20,
    fontFamily: font.bold,
    color: theme.ink.primary,
    backgroundColor: theme.surface.raised,
    textAlign: 'center',
    letterSpacing: 6,
  },
  pwWrap: { position: 'relative', justifyContent: 'center' },
  pwInput: {
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: radius.sm,
    padding: 14,
    paddingRight: 48,
    fontSize: 16,
    fontFamily: font.regular,
    color: theme.ink.primary,
    backgroundColor: theme.surface.raised,
  },
  eye: { position: 'absolute', right: 8, height: 44, width: 40, alignItems: 'center', justifyContent: 'center' },
  button: { marginTop: spacing.xs },
  back: { textAlign: 'center', fontSize: 14, fontFamily: font.medium, color: theme.ink.action, marginTop: spacing.md },
});
