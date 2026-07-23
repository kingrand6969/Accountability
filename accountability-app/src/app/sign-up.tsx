import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { validateEmail, validatePassword } from '../auth/validation';
import { validateBirthday, ageFromBirthday } from '../profiles/validation';
import { authErrorMessage } from '../auth/errors';
import { recordConsent } from '../auth/consent';
import { updateMyProfile } from '../profiles/api';
import { MIN_AGE } from '../legal/content';
import { AuthShell } from '../ui/AuthShell';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { colors, font, radius, spacing } from '../ui/theme';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthday, setBirthday] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSignUp() {
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError || passwordError) {
      Alert.alert('Check your details', emailError ?? passwordError ?? '');
      return;
    }
    const bdError = validateBirthday(birthday);
    if (!birthday.trim() || bdError) {
      Alert.alert('Date of birth', bdError ?? 'Please enter your date of birth (YYYY-MM-DD).');
      return;
    }
    const age = ageFromBirthday(birthday);
    if (age === null || age < MIN_AGE) {
      Alert.alert('Sorry', `You must be ${MIN_AGE} or older to use AccountAbility.`);
      return;
    }
    if (!agree) {
      Alert.alert('One more thing', 'Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      Alert.alert('Could not sign up', authErrorMessage(error.message));
      return;
    }
    if (data.session) {
      // Email confirmation is off → account is active immediately.
      await updateMyProfile({ birthday: birthday.trim() }).catch(() => {});
      await recordConsent();
    } else {
      // Confirmation required → verify the code, then we save the birthday there.
      router.push({ pathname: '/verify-email', params: { email: email.trim(), birthday: birthday.trim() } });
    }
  }

  return (
    <AuthShell>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.sub}>Start building your streak with people who keep you honest.</Text>

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
          placeholder="Password (8+ characters)"
          placeholderTextColor={colors.textFaint}
          secureTextEntry={!showPw}
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
        />
        <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={8} style={styles.eye} accessibilityLabel={showPw ? 'Hide password' : 'Show password'}>
          <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <View>
        <TextInput
          style={styles.input}
          placeholder="Date of birth (YYYY-MM-DD)"
          placeholderTextColor={colors.textFaint}
          keyboardType="numbers-and-punctuation"
          autoComplete="birthdate-full"
          value={birthday}
          onChangeText={setBirthday}
        />
        <Text style={styles.hint}>You must be {MIN_AGE}+ to use AccountAbility.</Text>
      </View>

      {/* safety + zero-tolerance — shown up front, before anyone joins */}
      <View style={styles.warnBox}>
        <View style={styles.warnRow}>
          <Ionicons name="fitness-outline" size={16} color="#b45309" style={styles.warnIcon} />
          <Text style={styles.warnText}>
            <Text style={styles.warnStrong}>Train safely.</Text> Check with a doctor — and ideally a
            qualified coach — before starting new workouts, and stay within your limits.
          </Text>
        </View>
        <View style={styles.warnRow}>
          <Ionicons name="hand-left-outline" size={16} color="#b91c1c" style={styles.warnIcon} />
          <Text style={styles.warnText}>
            <Text style={styles.warnStrong}>Zero tolerance.</Text> No nudity, hate, harassment, or
            content that harms people or animals. Violations are removed and accounts banned.
          </Text>
        </View>
      </View>

      <Checkbox checked={agree} onChange={setAgree} style={styles.consent} accessibilityLabel="Agree to Terms and Privacy Policy">
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

      <Button title="Sign up" onPress={onSignUp} loading={busy} style={styles.button} />
      <Link href="/sign-in" style={styles.linkCenter}>
        Already have an account? Log in
      </Link>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontFamily: font.extrabold, color: colors.text },
  sub: { fontSize: 14, fontFamily: font.regular, color: colors.textMuted, marginBottom: spacing.xs, lineHeight: 20 },
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
  hint: { fontSize: 12, fontFamily: font.regular, color: colors.textFaint, marginTop: 5, marginLeft: 2 },
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
  warnBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: radius.md,
    padding: 12,
    gap: 8,
    marginTop: 2,
  },
  warnRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  warnIcon: { marginTop: 1 },
  warnText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: font.regular, color: '#78350f' },
  warnStrong: { fontFamily: font.bold, color: '#78350f' },
  consent: { marginTop: 2 },
  consentText: { fontSize: 13.5, lineHeight: 20, fontFamily: font.regular, color: colors.textMuted },
  link: { color: colors.primary, fontFamily: font.semibold },
  button: { marginTop: spacing.xs },
  linkCenter: { textAlign: 'center', color: colors.primary, fontFamily: font.medium, marginTop: spacing.sm },
});
