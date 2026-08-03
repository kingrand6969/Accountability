import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import { validateEmail, validatePassword } from '../auth/validation';
import { validateBirthday, ageFromBirthday } from '../profiles/validation';
import { authErrorMessage } from '../auth/errors';
import { recordConsent } from '../auth/consent';
import { updateMyProfile } from '../profiles/api';
import { MIN_AGE } from '../legal/content';
import { AuthShell } from '../ui/AuthShell';
import { AuthField } from '../ui/AuthField';
import { DateOfBirthField } from '../ui/DateOfBirthField';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { colors, font, radius, spacing } from '../ui/theme';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthday, setBirthday] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [birthdayError, setBirthdayError] = useState('');
  const [consentError, setConsentError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSignUp() {
    const nextEmailError = validateEmail(email) ?? '';
    const nextPasswordError = validatePassword(password) ?? '';
    const rawBirthdayError = birthday.trim() ? validateBirthday(birthday) : null;
    const age = ageFromBirthday(birthday);
    const nextBirthdayError = !birthday.trim()
      ? 'Choose your date of birth.'
      : rawBirthdayError
        ? rawBirthdayError
        : age === null || age < MIN_AGE
          ? `You must be ${MIN_AGE} or older to use AccountAbility.`
          : '';
    const nextConsentError = agree
      ? ''
      : 'Please agree to the Terms of Service and Privacy Policy to continue.';

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setBirthdayError(nextBirthdayError);
    setConsentError(nextConsentError);
    setFormError('');
    if (nextEmailError || nextPasswordError || nextBirthdayError || nextConsentError) return;

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setFormError(authErrorMessage(error.message));
      return;
    }
    if (data.session) {
      await updateMyProfile({ birthday: birthday.trim() }).catch(() => {});
      await recordConsent();
    } else {
      router.push({ pathname: '/verify-email', params: { email: email.trim(), birthday: birthday.trim() } });
    }
  }

  return (
    <AuthShell>
      <View style={styles.heading}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.sub}>Build your first streak with people who keep you honest.</Text>
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
        placeholder="At least 8 characters"
        secureTextEntry={!showPw}
        autoComplete="new-password"
        textContentType="newPassword"
        value={password}
        error={passwordError}
        actionLabel={showPw ? 'Hide' : 'Show'}
        onActionPress={() => setShowPw((shown) => !shown)}
        onChangeText={(value) => {
          setPassword(value);
          if (passwordError) setPasswordError('');
          if (formError) setFormError('');
        }}
      />

      <DateOfBirthField
        value={birthday}
        onChange={(value) => {
          setBirthday(value);
          if (birthdayError) setBirthdayError('');
        }}
        minimumAge={MIN_AGE}
        error={birthdayError}
      />

      <View style={styles.safetyBox}>
        <Ionicons name="heart-circle-outline" size={19} color="#92400e" />
        <Text style={styles.safetyText}>
          Train safely and respect the community. AccountAbility is not medical advice, and harmful
          or abusive content is not allowed.{' '}
          <Text style={styles.safetyLink} onPress={() => router.push('/legal/terms')}>
            Review the rules.
          </Text>
        </Text>
      </View>

      <View>
        <Checkbox
          checked={agree}
          onChange={(checked) => {
            setAgree(checked);
            if (checked) setConsentError('');
          }}
          style={styles.consent}
          accessibilityLabel="Agree to Terms and Privacy Policy"
        >
          <Text style={styles.consentText}>
            I agree to the{' '}
            <Text style={styles.link} onPress={() => router.push('/legal/terms')}>
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text style={styles.link} onPress={() => router.push('/legal/privacy')}>
              Privacy Policy
            </Text>
            .
          </Text>
        </Checkbox>
        {consentError ? <Text style={styles.consentError}>{consentError}</Text> : null}
      </View>

      <Button title="Create account" onPress={onSignUp} loading={busy} />
      <Link href="/sign-in" style={styles.linkCenter}>
        Already have an account? <Text style={styles.linkStrong}>Log in</Text>
      </Link>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5, marginBottom: spacing.xs },
  title: {
    color: colors.text,
    fontFamily: font.extrabold,
    fontSize: 27,
    letterSpacing: -0.35,
  },
  sub: {
    color: colors.textMuted,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
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
  safetyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: radius.md,
    padding: 11,
    backgroundColor: 'rgba(255,251,235,0.9)',
  },
  safetyText: {
    flex: 1,
    color: '#78350f',
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  safetyLink: { color: '#92400e', fontFamily: font.bold, textDecorationLine: 'underline' },
  consent: { marginTop: 1 },
  consentText: {
    color: colors.textMuted,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  consentError: {
    color: colors.danger,
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 17,
    marginLeft: 32,
    marginTop: 5,
  },
  link: { color: colors.primary, fontFamily: font.semibold },
  linkCenter: {
    textAlign: 'center',
    color: colors.textMuted,
    fontFamily: font.regular,
    fontSize: 13.5,
    marginTop: spacing.xs,
  },
  linkStrong: { color: colors.primary, fontFamily: font.semibold },
});
