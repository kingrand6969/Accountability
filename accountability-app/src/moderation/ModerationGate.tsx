import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import {
  font,
  radius,
  spacing,
  type AppThemeColors,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import { acknowledgeWarning, fetchModerationState, sessionPing, type ModerationState } from './api';

const CONTACT_EMAIL = 'support@awldesk.com';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Sits above the whole app. Once the member is signed in it asks the server for
 * their standing and, if they've been sanctioned, blocks or interrupts the UI:
 *
 *  • banned      → a full-screen wall they can't get past (only "Sign out")
 *  • warning     → a one-time modal they must acknowledge
 *  • restricted  → an informational modal (posting is blocked server-side too)
 *
 * It re-checks whenever the app returns to the foreground, so a sanction applied
 * from the admin dashboard reaches an already-open session on the next resume.
 */
export function ModerationGate() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  if (!userId) return null;
  return <AuthenticatedModerationGate key={userId} />;
}

function AuthenticatedModerationGate() {
  const [state, setState] = useState<ModerationState | null>(null);
  const [ipBanned, setIpBanned] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);
  const [restrictionAcknowledged, setRestrictionAcknowledged] =
    useState(false);
  const refreshGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    // the ping also records the connection server-side (abuse prevention)
    const [next, ping] = await Promise.all([fetchModerationState(), sessionPing()]);
    if (generation !== refreshGeneration.current) return;
    setState(next);
    setIpBanned(ping.ipBanned);
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      refreshGeneration.current += 1;
    };
  }, [refresh]);

  // re-check on foreground so a mid-session ban/restrict/warn lands promptly
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setSigningOut(false);
    }
  }, []);

  const dismissWarning = useCallback(async () => {
    setWarningAcknowledged(true);
    setState((s) => (s ? { ...s, warning: null } : s));
    await acknowledgeWarning();
  }, []);

  if (!state) return null;

  // 1) Ban — a hard wall over everything (account ban or network/IP ban).
  if (state.banned) return <BanWall message={state.ban_message} onSignOut={signOut} busy={signingOut} />;
  if (ipBanned) {
    return (
      <BanWall
        message={
          'Access from your network has been suspended because of repeated abuse. ' +
          'If you believe this is a mistake, contact us and we will look into it.'
        }
        onSignOut={signOut}
        busy={signingOut}
      />
    );
  }

  // 2) Warning — must be acknowledged (once per session).
  if (state.warning && !warningAcknowledged) {
    return (
      <NoticeModal
        tone="warning"
        icon="warning"
        title="A note from the moderators"
        body={state.warning}
        cta="I understand"
        onClose={dismissWarning}
      />
    );
  }

  // 3) Restriction — informational; the server already blocks posting.
  if (state.restricted_until && !restrictionAcknowledged) {
    const until = fmtDate(state.restricted_until);
    return (
      <NoticeModal
        tone="restrict"
        icon="hand-left"
        title="Your account is restricted"
        body={
          (state.restrict_message ? state.restrict_message + '\n\n' : '') +
          `You can still browse and use the app, but posting, commenting, and messaging are paused${
            until ? ` until ${until}` : ''
          }.`
        }
        cta="Got it"
        onClose={() => setRestrictionAcknowledged(true)}
      />
    );
  }

  return null;
}

function BanWall({
  message,
  onSignOut,
  busy,
}: {
  message: string | null;
  onSignOut: () => void;
  busy: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={[styles.wall, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <ScrollView
        contentContainerStyle={styles.wallInner}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.wallIcon}>
          <Ionicons name="ban" size={38} color={theme.status.danger} />
        </View>
        <Text style={styles.wallTitle}>Account banned</Text>
        <Text style={styles.wallLede}>
          Your access to AccountAbility has been removed for breaking our Community Rules.
        </Text>
        {message ? (
          <View style={styles.wallCard}>
            <Text style={styles.wallCardText}>{message}</Text>
          </View>
        ) : null}
        <Text style={styles.wallAppeal}>
          If you believe this is a mistake, you can appeal by emailing{'\n'}
          <Text style={styles.wallEmail}>{CONTACT_EMAIL}</Text>
        </Text>
        <Pressable
          onPress={onSignOut}
          disabled={busy}
          style={({ pressed }) => [styles.wallBtn, pressed && styles.wallBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          {busy ? (
            <ActivityIndicator color={theme.ink.inverse} />
          ) : (
            <Text style={styles.wallBtnText}>Sign out</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function NoticeModal({
  tone,
  icon,
  title,
  body,
  cta,
  onClose,
}: {
  tone: 'warning' | 'restrict';
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  cta: string;
  onClose: () => void;
}) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const accent = tone === 'warning' ? theme.status.attention : theme.status.danger;
  const accentSoft = tone === 'warning' ? theme.surface.muted : theme.status.dangerSoft;
  return (
    <View style={styles.scrim}>
      <View style={styles.sheet}>
        <View style={[styles.sheetIcon, { backgroundColor: accentSoft }]}>
          <Ionicons name={icon} size={28} color={accent} />
        </View>
        <Text style={styles.sheetTitle}>{title}</Text>
        <ScrollView style={styles.sheetBodyWrap} contentContainerStyle={{ paddingVertical: 2 }}>
          <Text style={styles.sheetBody}>{body}</Text>
        </ScrollView>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.sheetBtn, pressed && styles.sheetBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={cta}
        >
          <Text style={styles.sheetBtnText}>{cta}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createPalette(theme: AppThemeColors) {
  return {
    sheet: theme.surface.card,
    sheetInk: theme.ink.primary,
    sheetSecondary: theme.ink.secondary,
    sheetAction: theme.ink.action,
    sheetOnAction: theme.ink.inverse,
    scrim: theme.interaction.scrim,
  };
}

function createStyles(theme: AppThemeColors) {
  const palette = createPalette(theme);
  return StyleSheet.create({
  // ---- ban wall ----
  wall: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: theme.surface.canvas,
    paddingHorizontal: 26,
  },
  wallInner: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  wallIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: theme.status.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  wallTitle: { fontFamily: font.extrabold, fontSize: 26, color: theme.ink.primary, marginBottom: 10 },
  wallLede: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: theme.ink.secondary,
    textAlign: 'center',
    maxWidth: 360,
    marginBottom: 20,
  },
  wallCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.surface.raised,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 22,
  },
  wallCardText: { fontFamily: font.regular, fontSize: 14.5, lineHeight: 22, color: theme.ink.secondary },
  wallAppeal: {
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 21,
    color: theme.ink.muted,
    textAlign: 'center',
    marginBottom: 28,
  },
  wallEmail: { fontFamily: font.semibold, color: theme.ink.action },
  wallBtn: {
    minHeight: spacing.touch,
    minWidth: 200,
    backgroundColor: theme.ink.action,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  wallBtnPressed: { opacity: 0.85 },
  wallBtnText: { fontFamily: font.bold, fontSize: 16, color: theme.ink.inverse },

  // ---- notice modal (warning / restriction) ----
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    backgroundColor: palette.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: palette.sheet,
    borderRadius: radius.xl,
    padding: 24,
    alignItems: 'center',
  },
  sheetIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: font.bold,
    fontSize: 19,
    color: palette.sheetInk,
    textAlign: 'center',
    marginBottom: 10,
  },
  sheetBodyWrap: { maxHeight: 260, alignSelf: 'stretch' },
  sheetBody: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 23,
    color: palette.sheetSecondary,
    textAlign: 'center',
  },
  sheetBtn: {
    minHeight: spacing.touch,
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    backgroundColor: palette.sheetAction,
  },
  sheetBtnPressed: { opacity: 0.9 },
  sheetBtnText: { fontFamily: font.bold, fontSize: 15.5, color: palette.sheetOnAction },
  });
}
