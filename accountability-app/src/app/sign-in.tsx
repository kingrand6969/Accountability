import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import { validateEmail, validatePassword } from '../auth/validation';
import { authErrorMessage, isUnconfirmed } from '../auth/errors';
import { AuthShell } from '../ui/AuthShell';
import { AuthField } from '../ui/AuthField';
import { Button } from '../ui/Button';
import { colors, font, radius, spacing } from '../ui/theme';
import { WELCOME_ACTIONS, welcomeErrorState } from '../entry/welcomeContract';

const CREATE_ACCOUNT_ROUTE = WELCOME_ACTIONS[1].route;
const FORGOT_PASSWORD_ROUTE = WELCOME_ACTIONS[2].route;

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const formErrorState = welcomeErrorState(formError, '');

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
    <AuthShell
      presentation="welcome"
      footer={
        <View style={styles.privacy}>
          <Ionicons name="shield-checkmark-outline" size={21} color="#FFFFFF" />
          <Text style={styles.privacyText}>
            Your progress is private.{'\n'}We&apos;ll never share your data.
          </Text>
        </View>
      }
    >
      <View style={styles.heading}>
        <Text style={styles.title}>Welcome Back!</Text>
      </View>

      {formErrorState.visible ? (
        <View style={styles.errorBanner} accessibilityLiveRegion={formErrorState.liveRegion}>
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
        onPress={() => router.push(FORGOT_PASSWORD_ROUTE)}
        accessibilityRole="link"
        style={({ pressed }) => [styles.forgot, pressed && styles.pressed]}
      >
        <Text style={styles.forgotText}>Forgot password?</Text>
      </Pressable>

      <Button title="Log in" onPress={onSignIn} loading={busy} style={styles.button} />

      <Button
        title="Create an account"
        onPress={() => router.push(CREATE_ACCOUNT_ROUTE)}
        variant="outline"
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  heading: { alignItems: 'center', marginBottom: spacing.xs },
  title: {
    color: colors.navy,
    fontFamily: font.serif,
    fontSize: 27,
    lineHeight: 34,
  },
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
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
  },
  privacyText: {
    color: '#FFFFFF',
    fontFamily: font.medium,
    fontSize: 11.5,
    lineHeight: 15,
  },
});
