import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { authErrorMessage } from '../auth/errors';
import { recordConsent } from '../auth/consent';
import { updateMyProfile } from '../profiles/api';
import { AuthShell } from '../ui/AuthShell';
import { Button } from '../ui/Button';
import { colors, font, radius, spacing } from '../ui/theme';

const RESEND_COOLDOWN_S = 45;

export default function VerifyEmail() {
  const { email, birthday } = useLocalSearchParams<{ email: string; birthday?: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function onVerify(value?: string) {
    const token = (value ?? code).trim();
    if (!email || token.length < 6 || busy) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    setBusy(false);
    if (error) {
      Alert.alert('Couldn’t verify', authErrorMessage(error.message));
      setCode('');
      return;
    }
    // Session now exists → save the birthday from sign-up + stamp the consent
    // they gave, then the AuthProvider routes into the app (onboarding).
    if (birthday) await updateMyProfile({ birthday }).catch(() => {});
    await recordConsent();
  }

  async function onResend() {
    if (!email || cooldown > 0) return;
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) {
      Alert.alert('Couldn’t resend', authErrorMessage(error.message));
      return;
    }
    setCooldown(RESEND_COOLDOWN_S);
    Alert.alert('Sent', 'We’ve emailed you a fresh code.');
  }

  return (
    <AuthShell>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.sub}>
        We sent a 6-digit code to{'\n'}
        <Text style={styles.email}>{email ?? 'your inbox'}</Text>. Enter it below to confirm your
        account.
      </Text>

      <TextInput
        ref={inputRef}
        style={styles.codeInput}
        placeholder="••••••"
        placeholderTextColor={colors.textFaint}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        value={code}
        onChangeText={(t) => {
          const digits = t.replace(/[^0-9]/g, '').slice(0, 6);
          setCode(digits);
          if (digits.length === 6) onVerify(digits);
        }}
      />

      <Button title="Confirm" onPress={() => onVerify()} loading={busy} disabled={code.length < 6} style={styles.button} />

      <Text style={styles.resend}>
        Didn’t get it?{' '}
        {cooldown > 0 ? (
          <Text style={styles.resendMuted}>Resend in {cooldown}s</Text>
        ) : (
          <Text style={styles.resendLink} onPress={onResend}>
            Resend code
          </Text>
        )}
      </Text>
      <Text style={styles.back} onPress={() => router.back()}>
        Wrong email? Go back
      </Text>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontFamily: font.extrabold, color: colors.text },
  sub: { fontSize: 14.5, fontFamily: font.regular, color: colors.textMuted, lineHeight: 21, marginBottom: spacing.sm },
  email: { fontFamily: font.bold, color: colors.text },
  codeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 16,
    fontSize: 30,
    fontFamily: font.bold,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    textAlign: 'center',
    letterSpacing: 12,
  },
  button: { marginTop: spacing.xs },
  resend: { textAlign: 'center', fontSize: 14, fontFamily: font.regular, color: colors.textMuted, marginTop: spacing.sm },
  resendMuted: { color: colors.textFaint, fontFamily: font.medium },
  resendLink: { color: colors.primary, fontFamily: font.semibold },
  back: { textAlign: 'center', fontSize: 13, fontFamily: font.medium, color: colors.textFaint, marginTop: spacing.sm },
});
