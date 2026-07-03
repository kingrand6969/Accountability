import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import {
  CARD_BLUE,
  getMyBuddyCard,
  saveMyBuddyCard,
  type BuddyCard,
} from '../buddy/card';
import { uploadPostImage } from '../feed/uploadPostImage';
import { getMyProfile } from '../profiles/api';
import { authorLabel } from '../feed/format';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { colors, font, radius, shadow, spacing } from '../ui/theme';

export default function BuddyCardEdit() {
  const router = useRouter();
  const [card, setCard] = useState<BuddyCard>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [myName, setMyName] = useState<string | null>(null);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [myArea, setMyArea] = useState<string | null>(null);
  const [myBio, setMyBio] = useState<string | null>(null);

  useEffect(() => {
    getMyBuddyCard().then(setCard).catch(() => {});
    getMyProfile()
      .then((p) => {
        setMyName(p?.display_name ?? null);
        setMyAvatar(p?.avatar_url ?? null);
        setMyArea(p?.area ?? null);
        setMyBio(p?.bio ?? null);
      })
      .catch(() => {});
  }, []);

  const mode = card.mode ?? 'profile';
  // exactly what a visitor will see (same logic as the card screen)
  const headline =
    mode === 'custom'
      ? card.headline?.trim() || null
      : myArea
        ? `Trains around ${myArea}`
        : null;
  const about =
    (mode === 'custom' ? card.about?.trim() : myBio) ||
    'They haven’t written anything yet — say hi and find out!';

  async function onPickBackground() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to set a background.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 10],
      quality: 0.7,
      base64: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (!asset.base64) {
      Alert.alert('Could not read image', 'Please try a different photo.');
      return;
    }
    setUploading(true);
    try {
      const ext = asset.uri.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpg';
      const url = await uploadPostImage(asset.base64, ext);
      setCard((c) => ({ ...c, bg_url: url }));
    } catch (e) {
      Alert.alert('Upload failed', String((e as Error).message ?? e));
    } finally {
      setUploading(false);
    }
  }

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
      <Text style={styles.sectionTitle}>Background</Text>
      <View style={styles.bgRow}>
        <Button
          title={card.bg_url ? 'Change photo' : 'Add a photo'}
          onPress={onPickBackground}
          loading={uploading}
          variant="outline"
          icon={<Ionicons name="image-outline" size={17} color={colors.primary} />}
          style={{ flex: 1 }}
        />
        {card.bg_url ? (
          <Button
            title="Use blue"
            variant="ghost"
            onPress={() => setCard((c) => ({ ...c, bg_url: null }))}
            style={{ flex: 1 }}
          />
        ) : null}
      </View>
      <Text style={styles.hint}>Blue by default — or use a photo of you doing your thing.</Text>

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
      ) : (
        <Text style={styles.hint}>
          Your card shows your area and profile bio automatically.
        </Text>
      )}

      {/* live preview — EXACTLY what a visitor sees */}
      <Text style={styles.sectionTitle}>How visitors see you</Text>
      <View style={styles.card}>
        <View style={styles.photoFrame}>
          {card.bg_url ? (
            <Image source={{ uri: card.bg_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={CARD_BLUE}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          {headline ? (
            <View style={styles.focusChip}>
              <Ionicons name="flame" size={12} color="#fde68a" />
              <Text style={styles.focusText} numberOfLines={4}>
                {headline}
              </Text>
            </View>
          ) : null}
          <View style={styles.avatarRing}>
            {myAvatar ? (
              <Image source={{ uri: myAvatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="person" size={36} color="#fff" />
              </View>
            )}
          </View>
        </View>
        <Text style={styles.name}>{authorLabel(myName)}</Text>
        <Text style={styles.subtitle}>Accountability buddy</Text>
        <View style={styles.aboutBox}>
          <Text style={styles.aboutTitle}>Profile</Text>
          <Text style={styles.aboutText}>{about}</Text>
        </View>
      </View>

      <Button title="Save my buddy card" onPress={onSave} loading={saving} style={styles.save} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.background,
    paddingBottom: 40,
  },
  pressed: { opacity: 0.75 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  bgRow: { flexDirection: 'row', gap: spacing.sm },
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
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    ...shadow.card,
  },
  photoFrame: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    paddingVertical: spacing.xl,
    minHeight: 170,
    justifyContent: 'center',
  },
  focusChip: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    maxWidth: 130,
    flexDirection: 'row',
    gap: 5,
    backgroundColor: 'rgba(15,23,42,0.62)',
    borderRadius: radius.md,
    padding: 8,
  },
  focusText: {
    color: '#fff',
    fontFamily: font.semibold,
    fontSize: 11,
    flexShrink: 1,
    lineHeight: 15,
  },
  avatarRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  avatar: { width: 104, height: 104, borderRadius: 52 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: font.extrabold, fontSize: 18, color: colors.text, marginTop: spacing.md },
  subtitle: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  aboutBox: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  aboutTitle: { fontFamily: font.bold, fontSize: 13.5, color: colors.text, marginBottom: 4 },
  aboutText: {
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  save: { marginTop: spacing.lg },
});
