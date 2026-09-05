import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { sendSupportMessage, type SupportKind } from '../support/api';
import { CONTACT_EMAIL } from '../legal/content';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import {
  contentMax,
  font,
  radius,
  spacing,
  type AppThemeColors,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

const KINDS: { key: SupportKind; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'support', label: 'Question', icon: 'help-buoy-outline' },
  { key: 'report', label: 'Report a problem', icon: 'flag-outline' },
  { key: 'feedback', label: 'Feedback', icon: 'chatbubble-ellipses-outline' },
];

export default function HelpScreen() {
  const { colors: theme } = useAppTheme();
  const palette = useMemo(() => helpPalette(theme), [theme]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [kind, setKind] = useState<SupportKind>('support');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSend() {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await sendSupportMessage(kind, body, subject);
      setSubject('');
      setBody('');
      showToast('Message sent — we’ll get back to you.');
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      Alert.alert('Could not send', /too many/i.test(msg) ? 'Please wait a bit and try again.' : msg);
    } finally {
      setBusy(false);
    }
  }

  function emailUs() {
    const subj = encodeURIComponent(subject.trim() || 'Mantle support');
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subj}`).catch(() =>
      Alert.alert('No email app', `Reach us at ${CONTACT_EMAIL}`),
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Need a hand, or want to report something? Send us a message or email us — we read every one.
      </Text>

      {/* message form */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Send us a message</Text>

        <View style={styles.pills}>
          {KINDS.map((k) => {
            const on = kind === k.key;
            return (
              <Pressable
                key={k.key}
                onPress={() => setKind(k.key)}
                style={({ pressed }) => [styles.pill, on && styles.pillOn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Ionicons name={k.icon} size={14} color={on ? palette.onAction : palette.muted} />
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{k.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Subject (optional)"
          placeholderTextColor={palette.placeholder}
          value={subject}
          onChangeText={setSubject}
          maxLength={140}
        />
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder={
            kind === 'report'
              ? 'Describe the problem or the content you’re reporting…'
              : 'How can we help?'
          }
          placeholderTextColor={palette.placeholder}
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={4000}
        />
        <Button title="Send message" onPress={onSend} loading={busy} disabled={!body.trim()} />

        <Pressable onPress={emailUs} style={styles.emailRow} accessibilityRole="link">
          <Ionicons name="mail-outline" size={16} color={palette.action} />
          <Text style={styles.emailText}>Prefer email? Write to {CONTACT_EMAIL}</Text>
        </Pressable>
      </View>

      {/* policies */}
      <View style={styles.card}>
        <LinkRow
          icon="document-text-outline"
          label="Terms of Service"
          onPress={() => router.push('/legal/terms')}
          styles={styles}
          palette={palette}
        />
        <View style={styles.divider} />
        <LinkRow
          icon="shield-checkmark-outline"
          label="Privacy Policy"
          onPress={() => router.push('/legal/privacy')}
          styles={styles}
          palette={palette}
        />
      </View>

      <Text style={styles.foot}>
        To report or block a specific person, open their profile and tap the ⋮ menu.
      </Text>
    </ScrollView>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
  styles,
  palette,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  palette: ReturnType<typeof helpPalette>;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}>
      <Ionicons name={icon} size={19} color={palette.action} />
      <Text style={styles.linkLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color={palette.placeholder} />
    </Pressable>
  );
}

function helpPalette(theme: AppThemeColors) {
  return {
    background: theme.surface.canvas,
    card: theme.surface.card,
    field: theme.surface.raised,
    ink: theme.ink.primary,
    muted: theme.ink.muted,
    placeholder: theme.ink.muted,
    border: theme.border.subtle,
    action: theme.ink.action,
    onAction: theme.ink.inverse,
  };
}

function createStyles(theme: AppThemeColors) {
  const palette = helpPalette(theme);
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  scroll: { ...contentMax, padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  intro: { fontSize: 14.5, lineHeight: 21, fontFamily: font.regular, color: palette.muted },
  pressed: { opacity: 0.7 },
  card: {
    backgroundColor: palette.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: { fontSize: 16, fontFamily: font.bold, color: palette.ink },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.field,
    minHeight: spacing.touch,
  },
  pillOn: { backgroundColor: palette.action, borderColor: palette.action },
  pillText: { fontSize: 13, fontFamily: font.semibold, color: palette.muted },
  pillTextOn: { color: palette.onAction },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    padding: 13,
    fontSize: 15,
    fontFamily: font.regular,
    color: palette.ink,
    backgroundColor: palette.field,
    minHeight: spacing.touch,
  },
  textarea: { minHeight: 110, textAlignVertical: 'top' },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center', paddingTop: 2, minHeight: spacing.touch },
  emailText: { fontSize: 13.5, fontFamily: font.medium, color: palette.action },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, minHeight: spacing.touch },
  linkLabel: { flex: 1, fontSize: 15.5, fontFamily: font.semibold, color: palette.ink },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
  foot: { fontSize: 12.5, lineHeight: 18, fontFamily: font.regular, color: palette.placeholder, textAlign: 'center', marginTop: 4 },
  });
}
