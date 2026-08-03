import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { sendSupportMessage, type SupportKind } from '../support/api';
import { CONTACT_EMAIL } from '../legal/content';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { colors, contentMax, font, radius, spacing } from '../ui/theme';

const KINDS: { key: SupportKind; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'support', label: 'Question', icon: 'help-buoy-outline' },
  { key: 'report', label: 'Report a problem', icon: 'flag-outline' },
  { key: 'feedback', label: 'Feedback', icon: 'chatbubble-ellipses-outline' },
];

export default function HelpScreen() {
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
    const subj = encodeURIComponent(subject.trim() || 'AccountAbility support');
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
                <Ionicons name={k.icon} size={14} color={on ? '#fff' : colors.textMuted} />
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{k.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Subject (optional)"
          placeholderTextColor={colors.textFaint}
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
          placeholderTextColor={colors.textFaint}
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={4000}
        />
        <Button title="Send message" onPress={onSend} loading={busy} disabled={!body.trim()} />

        <Pressable onPress={emailUs} style={styles.emailRow} accessibilityRole="link">
          <Ionicons name="mail-outline" size={16} color={colors.primary} />
          <Text style={styles.emailText}>Prefer email? Write to {CONTACT_EMAIL}</Text>
        </Pressable>
      </View>

      {/* policies */}
      <View style={styles.card}>
        <LinkRow icon="document-text-outline" label="Terms of Service" onPress={() => router.push('/legal/terms')} />
        <View style={styles.divider} />
        <LinkRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}>
      <Ionicons name={icon} size={19} color={colors.primary} />
      <Text style={styles.linkLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { ...contentMax, padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  intro: { fontSize: 14.5, lineHeight: 21, fontFamily: font.regular, color: colors.textMuted },
  pressed: { opacity: 0.7 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: { fontSize: 16, fontFamily: font.bold, color: colors.text },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 13, fontFamily: font.semibold, color: colors.textMuted },
  pillTextOn: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 13,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  textarea: { minHeight: 110, textAlignVertical: 'top' },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center', paddingTop: 2 },
  emailText: { fontSize: 13.5, fontFamily: font.medium, color: colors.primary },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12 },
  linkLabel: { flex: 1, fontSize: 15.5, fontFamily: font.semibold, color: colors.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  foot: { fontSize: 12.5, lineHeight: 18, fontFamily: font.regular, color: colors.textFaint, textAlign: 'center', marginTop: 4 },
});
