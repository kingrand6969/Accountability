import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { validateEmail, validatePassword } from '../auth/validation';
import { authErrorMessage, isUnconfirmed } from '../auth/errors';
import { AuthShell } from '../ui/AuthShell';
import { AuthField } from '../ui/AuthField';
import { Button } from '../ui/Button';
import { colors, font, radius, spacing } from '../ui/theme';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    const nextEmailError = validateEmail(email) ?? '';
    const nextPasswordError = validatePassword(password) ?? '';
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError('');
    if (nextEmailError || nextPasswordError) return;

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (!error) return;
    if (isUnconfirmed(error.message)) {
      supabase.auth.resend({ type: 'signup', email: email.trim() }).catch(() => {});
      router.push({ pathname: '/verify-email', params: { email: email.trim() } });
      return;
    }
    setFormError(authErrorMessage(error.message));
  }

  return (
    <AuthShell glass>
      <View style={styles.heading}>
        <Text style={styles.title}>Welcome Back!</Text>
        <Text style={styles.sub}>Pick up where you left off.</Text>
      </View>

      {formError ? (
        <View style={styles.errorBanner} accessibilityLiveRegion="assertive">
          <Ionicons name="alert-circle-outline" size={19} color="#b91c1c" />
          <Text style={styles.errorBannerText}>{formError}</Text>
        </View>
      ) : null}

      <AuthField
        label="Email"
        icon="mail-outline"
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        value={email}
        error={emailError}
        onChangeText={(value) => {
          setEmail(value);
          if (emailError) setEmailError('');
          if (formError) setFormError('');
        }}
      />

      <AuthField
        label="Password"
        icon="lock-closed-outline"
        placeholder="Enter your password"
        secureTextEntry={!showPw}
        autoComplete="current-password"
        textContentType="password"
        value={password}
        error={passwordError}
        actionLabel={showPw ? 'Hide' : 'Show'}
        onActionPress={() => setShowPw((shown) => !shown)}
        onChangeText={(value) => {
          setPassword(value);
          if (passwordError) setPasswordError('');
          if (formError) setFormError('');
        }}
        onSubmitEditing={onSignIn}
        returnKeyType="go"
      />

      <Pressable
        onPress={() => router.push('/forgot-password')}
        accessibilityRole="link"
        style={({ pressed }) => [styles.forgot, pressed && styles.pressed]}
      >
        <Text style={styles.forgotText}>Forgot password?</Text>
      </Pressable>

      <Button title="Log in" onPress={onSignIn} loading={busy} style={styles.button} />

      <View style={styles.privacy}>
        <Ionicons name="shield-checkmark-outline" size={17} color="#1e40af" />
        <Text style={styles.privacyText}>
          Your progress and accountability activity stay private.
        </Text>
      </View>

      <Link href="/sign-up" style={styles.link}>
        New to AccountAbility? <Text style={styles.linkStrong}>Create an account</Text>
      </Link>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5, marginBottom: spacing.xs },
  title: {
    color: colors.text,
    fontFamily: font.extrabold,
    fontSize: 28,
    letterSpacing: -0.35,
  },
  sub: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14.5 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  errorBannerText: {
    flex: 1,
    color: '#991b1b',
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  forgot: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: -6,
  },
  forgotText: { color: colors.primary, fontFamily: font.semibold, fontSize: 13.5 },
  pressed: { opacity: 0.65 },
  button: { marginTop: -2 },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 11,
    borderRadius: radius.md,
    backgroundColor: 'rgba(219,234,254,0.7)',
  },
  privacyText: {
    flex: 1,
    color: '#1e3a8a',
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  link: {
    textAlign: 'center',
    color: colors.textMuted,
    fontFamily: font.regular,
    fontSize: 13.5,
    marginTop: spacing.xs,
  },
  linkStrong: { color: colors.primary, fontFamily: font.semibold },
});
