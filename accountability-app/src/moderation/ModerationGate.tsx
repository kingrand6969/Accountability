import { useCallback, useEffect, useRef, useState } from 'react';
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
import { colors, font, radius, spacing } from '../ui/theme';
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
  const [state, setState] = useState<ModerationState | null>(null);
  const [ipBanned, setIpBanned] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // dismissed-this-session flags so a modal doesn't reappear after "Got it"
  const ackWarning = useRef(false);
  const ackRestrict = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setState(null);
      setIpBanned(false);
      return;
    }
    // the ping also records the connection server-side (abuse prevention)
    const [next, ping] = await Promise.all([fetchModerationState(), sessionPing()]);
    setState(next);
    setIpBanned(ping.ipBanned);
  }, [userId]);

  useEffect(() => {
    ackWarning.current = false;
    ackRestrict.current = false;
    refresh();
  }, [userId, refresh]);

  // re-check on foreground so a mid-session ban/restrict/warn lands promptly
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
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
    ackWarning.current = true;
    setState((s) => (s ? { ...s, warning: null } : s));
    await acknowledgeWarning();
  }, []);

  if (!userId || !state) return null;

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
  if (state.warning && !ackWarning.current) {
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
  if (state.restricted_until && !ackRestrict.current) {
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
        onClose={() => {
          ackRestrict.current = true;
          setState((s) => ({ ...(s as ModerationState) }));
        }}
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
  return (
    <View style={[styles.wall, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <ScrollView
        contentContainerStyle={styles.wallInner}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.wallIcon}>
          <Ionicons name="ban" size={38} color="#fca5a5" />
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
          style={({ pressed }) => [styles.wallBtn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
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
  const accent = tone === 'warning' ? colors.accent : '#f97316';
  const accentSoft = tone === 'warning' ? 'rgba(251,191,36,0.16)' : 'rgba(249,115,22,0.14)';
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
          style={({ pressed }) => [styles.sheetBtn, { backgroundColor: colors.text }, pressed && { opacity: 0.9 }]}
          accessibilityRole="button"
          accessibilityLabel={cta}
        >
          <Text style={styles.sheetBtnText}>{cta}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ---- ban wall ----
  wall: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: '#0b1220',
    paddingHorizontal: 26,
  },
  wallInner: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  wallIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(239,68,68,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  wallTitle: { fontFamily: font.extrabold, fontSize: 26, color: '#f8fafc', marginBottom: 10 },
  wallLede: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: '#cbd5e1',
    textAlign: 'center',
    maxWidth: 360,
    marginBottom: 20,
  },
  wallCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 22,
  },
  wallCardText: { fontFamily: font.regular, fontSize: 14.5, lineHeight: 22, color: '#e2e8f0' },
  wallAppeal: {
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 21,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 28,
  },
  wallEmail: { fontFamily: font.semibold, color: '#93c5fd' },
  wallBtn: {
    minWidth: 200,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  wallBtnText: { fontFamily: font.bold, fontSize: 16, color: '#fff' },

  // ---- notice modal (warning / restriction) ----
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.card,
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
    color: colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  sheetBodyWrap: { maxHeight: 260, alignSelf: 'stretch' },
  sheetBody: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  sheetBtn: {
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  sheetBtnText: { fontFamily: font.bold, fontSize: 15.5, color: '#fff' },
});
