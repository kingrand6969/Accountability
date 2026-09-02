import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLegalConsent } from '../auth/LegalConsentProvider';
import { supabase } from '../lib/supabase';
import { AuthShell } from '../ui/AuthShell';
import { Button } from '../ui/Button';
import { EFFECTIVE_DATE } from '../legal/content';
import { font, radius, spacing, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

export default function ConsentRefresh() {
  const consent = useLegalConsent();
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      return true;
    });
    return () => subscription.remove();
  }, []);

  async function accept() {
    await consent.accept();
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  const checking = consent.status === 'loading';
  const checkFailed = consent.status === 'error';
  return (
    <AuthShell>
      <View style={styles.icon}>
        <Ionicons name="document-text-outline" size={28} color={theme.ink.action} />
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        {checking ? 'Checking your agreement' :
          checkFailed ? 'Agreement check unavailable' : 'Terms and Privacy updated'}
      </Text>
      {checking ? (
        <View style={styles.checking}>
          <ActivityIndicator
            accessibilityLabel="Checking legal agreement status"
            color={theme.ink.action}
          />
          <Text style={styles.body}>
            Checking whether this account has accepted the current Terms and Privacy Policy.
          </Text>
        </View>
      ) : checkFailed ? (
        <Text accessibilityRole="alert" style={styles.body}>{consent.error}</Text>
      ) : (
        <>
          <Text style={styles.body}>
            We updated our Terms of Service and Privacy Policy for Mantle, effective {EFFECTIVE_DATE}.
            Review both documents, then explicitly accept them to continue using the app.
          </Text>
          <View style={styles.links}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Read updated Terms of Service"
              onPress={() => router.push('/legal/terms')}
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            >
              <Text style={styles.linkText}>Read Terms of Service</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.ink.action} />
            </Pressable>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Read updated Privacy Policy"
              onPress={() => router.push('/legal/privacy')}
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            >
              <Text style={styles.linkText}>Read Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.ink.action} />
            </Pressable>
          </View>
          {consent.error ? <Text accessibilityRole="alert" style={styles.error}>{consent.error}</Text> : null}
        </>
      )}
      {checking ? null : (
        <Button
          title={checkFailed ? 'Try again' : 'Accept and continue'}
          accessibilityLabel={
            checkFailed ? 'Retry legal agreement check' : 'Accept updated Terms and Privacy Policy'
          }
          onPress={checkFailed ? consent.retry : () => { void accept(); }}
          loading={consent.accepting}
        />
      )}
      <Button
        title="Sign out"
        accessibilityLabel="Sign out instead"
        variant="ghost"
        onPress={() => { void signOut(); }}
        loading={signingOut}
      />
    </AuthShell>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  icon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface.muted,
  },
  title: {
    fontFamily: font.extrabold,
    fontSize: 24,
    lineHeight: 30,
    color: theme.ink.primary,
  },
  body: {
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 22,
    color: theme.ink.secondary,
  },
  checking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  links: { gap: spacing.sm },
  link: {
    minHeight: spacing.touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.border.strong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  linkText: { fontFamily: font.semibold, fontSize: 14, color: theme.ink.action },
  pressed: { opacity: 0.72 },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 19,
    color: theme.status.danger,
  },
});
