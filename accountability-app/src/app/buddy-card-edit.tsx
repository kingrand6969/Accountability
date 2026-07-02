import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CARD_BACKGROUNDS,
  cardBackground,
  getMyBuddyCard,
  saveMyBuddyCard,
  type BuddyCard,
} from '../buddy/card';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing } from '../ui/theme';

export default function BuddyCardEdit() {
  const router = useRouter();
  const [card, setCard] = useState<BuddyCard>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyBuddyCard().then(setCard).catch(() => {});
  }, []);

  const mode = card.mode ?? 'profile';

  async function onSave() {
    setSaving(true);
    try {
      await saveMyBuddyCard(card);
      showToast('Buddy card saved');
      router.back();
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>Card background</Text>
      <View style={styles.swatches}>
        {CARD_BACKGROUNDS.map((b) => {
          const selected = (card.bg ?? 'ocean') === b.key;
          return (
            <Pressable
              key={b.key}
              onPress={() => setCard((c) => ({ ...c, bg: b.key }))}
              accessibilityLabel={`${b.label} background`}
              style={({ pressed }) => [styles.swatchWrap, pressed && styles.pressed]}
            >
              <LinearGradient
                colors={b.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.swatch, selected && styles.swatchSelected]}
              >
                {selected ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
              </LinearGradient>
              <Text style={styles.swatchLabel}>{b.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Card info comes from</Text>
      <View style={styles.toggle}>
        {(
          [
            { value: 'profile', label: 'My profile' },
            { value: 'custom', label: 'Custom text' },
          ] as const
        ).map((o) => (
          <Pressable
            key={o.value}
            onPress={() => setCard((c) => ({ ...c, mode: o.value }))}
            style={({ pressed }) => [
              styles.toggleBtn,
              mode === o.value && styles.toggleActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.toggleText, mode === o.value && styles.toggleTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>
        {mode === 'profile'
          ? 'Your card shows your area and profile bio automatically.'
          : 'Write exactly what buddy seekers should see.'}
      </Text>

      {mode === 'custom' ? (
        <>
          <Text style={styles.label}>Focus line (shows on your photo)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Morning runs · 5k pace · looking for a jog partner"
            placeholderTextColor={colors.textFaint}
            value={card.headline ?? ''}
            onChangeText={(t) => setCard((c) => ({ ...c, headline: t }))}
            maxLength={90}
          />
          <Text style={styles.label}>About you</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="What are you working on? What kind of buddy do you want?"
            placeholderTextColor={colors.textFaint}
            value={card.about ?? ''}
            onChangeText={(t) => setCard((c) => ({ ...c, about: t }))}
            multiline
            maxLength={400}
          />
        </>
      ) : null}

      {/* mini preview */}
      <Text style={styles.sectionTitle}>Preview</Text>
      <LinearGradient
        colors={cardBackground(card.bg)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.preview}
      >
        <View style={styles.previewAvatar}>
          <Ionicons name="person" size={22} color="#fff" />
        </View>
        {mode === 'custom' && card.headline?.trim() ? (
          <View style={styles.previewChip}>
            <Text style={styles.previewChipText} numberOfLines={2}>
              {card.headline}
            </Text>
          </View>
        ) : null}
      </LinearGradient>

      <Button title="Save my buddy card" onPress={onSave} loading={saving} style={styles.save} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.background, paddingBottom: 40 },
  pressed: { opacity: 0.75 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  swatchWrap: { alignItems: 'center', gap: 4 },
  swatch: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: { borderWidth: 3, borderColor: colors.text },
  swatchLabel: { fontFamily: font.medium, fontSize: 11.5, color: colors.textMuted },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 3,
  },
  toggleBtn: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: 8, minHeight: 40 },
  toggleActive: { backgroundColor: colors.card },
  toggleText: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 14 },
  toggleTextActive: { color: colors.primary },
  hint: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted },
  label: {
    fontSize: 13.5,
    fontFamily: font.semibold,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  preview: {
    borderRadius: radius.lg,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  previewAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewChip: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    maxWidth: 150,
    backgroundColor: 'rgba(15,23,42,0.45)',
    borderRadius: radius.sm,
    padding: 7,
  },
  previewChipText: { color: '#fff', fontFamily: font.semibold, fontSize: 10.5 },
  save: { marginTop: spacing.lg },
});
