import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { useIsPro } from '../../pro/ProProvider';
import {
  isStreakReminderOn,
  enableStreakReminder,
  disableStreakReminder,
} from '../../notifications/streakReminder';
import { getMyProfile, updateMyProfile, touchLastActive } from '../../profiles/api';
import { validateBirthday } from '../../profiles/validation';
import { uploadAvatar } from '../../profiles/avatar';
import { ChipSelector } from '../../profiles/ChipSelector';
import { Button } from '../../ui/Button';
import { showToast } from '../../ui/Toast';
import { colors, font, radius, shadow, spacing } from '../../ui/theme';
import type {
  Gender,
  RelationshipStatus,
  SexualOrientation,
} from '../../profiles/types';

const RELATIONSHIP_OPTIONS: { value: RelationshipStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'in_relationship', label: 'In a relationship' },
  { value: 'married', label: 'Married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'separated', label: 'Separated' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const ORIENTATION_OPTIONS: { value: SexualOrientation; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'gay', label: 'Gay' },
  { value: 'lesbian', label: 'Lesbian' },
  { value: 'bisexual', label: 'Bisexual' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export default function Profile() {
  const { session } = useAuth();
  const { isPro } = useIsPro();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [area, setArea] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [genderPrivate, setGenderPrivate] = useState(true);
  const [orientation, setOrientation] = useState<SexualOrientation | null>(null);
  const [orientationPrivate, setOrientationPrivate] = useState(true);
  const [birthday, setBirthday] = useState('');
  const [birthdayPrivate, setBirthdayPrivate] = useState(true);
  const [relationship, setRelationship] = useState<RelationshipStatus | null>(null);
  const [showLastActive, setShowLastActive] = useState(true);
  const [remindOn, setRemindOn] = useState(false);

  useEffect(() => {
    isStreakReminderOn().then(setRemindOn).catch(() => {});
  }, []);

  async function onToggleReminder(value: boolean) {
    setRemindOn(value);
    try {
      if (value) {
        const ok = await enableStreakReminder();
        if (!ok) {
          setRemindOn(false);
          Alert.alert('Notifications off', 'Enable notifications to get reminders.');
        }
      } else {
        await disableStreakReminder();
      }
    } catch (e) {
      setRemindOn(!value);
      Alert.alert('Could not update reminder', String((e as Error).message ?? e));
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await touchLastActive();
        const p = await getMyProfile();
        if (!active || !p) return;
        setAvatarUrl(p.avatar_url);
        setDisplayName(p.display_name ?? '');
        setArea(p.area ?? '');
        setBio(p.bio ?? '');
        setGender(p.gender);
        setGenderPrivate(p.gender_private);
        setOrientation(p.sexual_orientation);
        setOrientationPrivate(p.sexual_orientation_private);
        setBirthday(p.birthday ?? '');
        setBirthdayPrivate(p.birthday_private);
        setRelationship(p.relationship_status);
        setShowLastActive(p.show_last_active);
        setJoinedAt(p.created_at);
      } catch (e) {
        Alert.alert('Could not load profile', String((e as Error).message ?? e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function onSave() {
    const birthdayError = validateBirthday(birthday);
    if (birthdayError) {
      Alert.alert('Check your birthday', birthdayError);
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile({
        display_name: displayName.trim() || null,
        area: area.trim() || null,
        bio: bio.trim() || null,
        gender,
        gender_private: genderPrivate,
        sexual_orientation: orientation,
        sexual_orientation_private: orientationPrivate,
        birthday: birthday.trim() || null,
        birthday_private: birthdayPrivate,
        relationship_status: relationship,
        show_last_active: showLastActive,
      });
      showToast('Profile saved');
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function onPickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Could not read image', 'Please try a different photo.');
      return;
    }
    const ext = asset.uri.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpg';
    setUploading(true);
    try {
      const url = await uploadAvatar(asset.base64, ext);
      await updateMyProfile({ avatar_url: url });
      setAvatarUrl(url);
      showToast('Photo updated');
    } catch (e) {
      Alert.alert('Upload failed', String((e as Error).message ?? e));
    } finally {
      setUploading(false);
    }
  }

  async function onSignOut() {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) Alert.alert('Could not sign out', error.message);
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* identity header */}
      <View style={styles.avatarBlock}>
        <Pressable
          onPress={onPickAvatar}
          disabled={uploading}
          style={styles.avatarRing}
          accessibilityLabel="Change profile photo"
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>
                {(displayName || session?.user.email || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {uploading ? (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : (
            <View style={styles.avatarEdit}>
              <Ionicons name="camera" size={13} color="#fff" />
            </View>
          )}
        </Pressable>
        <Text style={styles.email}>{displayName || session?.user.email || 'Signed in'}</Text>
        {joinedAt ? (
          <Text style={styles.meta}>
            Joined {new Date(joinedAt).toLocaleDateString()}
          </Text>
        ) : null}
      </View>

      {/* quick links */}
      <Pressable
        style={({ pressed }) => [
          styles.linkRow,
          isPro ? styles.proRowActive : styles.proRow,
          pressed && styles.pressed,
        ]}
        onPress={() => router.push('/paywall')}
      >
        <View style={styles.linkLeft}>
          <Ionicons name="star" size={17} color={isPro ? colors.pro : '#fff'} />
          <Text style={[styles.linkText, { color: isPro ? colors.pro : '#fff' }]}>
            {isPro ? 'Accountability Pro' : 'Upgrade to Pro'}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={isPro ? colors.pro : '#fff'}
        />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.linkRow, styles.buddyRow, pressed && styles.pressed]}
        onPress={() => router.push('/buddy')}
      >
        <View style={styles.linkLeft}>
          <Ionicons name="people-outline" size={18} color={colors.text} />
          <Text style={[styles.linkText, { color: colors.text }]}>
            Accountability Buddies
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Pressable>

      <Section title="About you">
        <Text style={styles.label}>Display name</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={colors.textFaint}
          value={displayName}
          onChangeText={setDisplayName}
        />
        <Text style={styles.label}>Area</Text>
        <TextInput
          style={styles.input}
          placeholder="City or region (no exact address)"
          placeholderTextColor={colors.textFaint}
          value={area}
          onChangeText={setArea}
        />
        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="A short intro"
          placeholderTextColor={colors.textFaint}
          value={bio}
          onChangeText={setBio}
          multiline
        />
      </Section>

      <Section title="Private details">
        <Text style={styles.sectionNote}>
          Optional and private by default — you choose what to show.
        </Text>
        <Text style={styles.label}>Gender</Text>
        <ChipSelector options={GENDER_OPTIONS} value={gender} onChange={setGender} />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Hide my gender</Text>
          <Switch value={genderPrivate} onValueChange={setGenderPrivate} />
        </View>

        <Text style={styles.label}>Sexual orientation</Text>
        <ChipSelector
          options={ORIENTATION_OPTIONS}
          value={orientation}
          onChange={setOrientation}
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Hide my sexual orientation</Text>
          <Switch value={orientationPrivate} onValueChange={setOrientationPrivate} />
        </View>

        <Text style={styles.label}>Birthday</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          value={birthday}
          onChangeText={setBirthday}
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Keep birthday private</Text>
          <Switch value={birthdayPrivate} onValueChange={setBirthdayPrivate} />
        </View>

        <Text style={styles.label}>Relationship status</Text>
        <ChipSelector
          options={RELATIONSHIP_OPTIONS}
          value={relationship}
          onChange={setRelationship}
        />
      </Section>

      <Section title="Preferences">
        <View style={styles.switchRow}>
          <View style={styles.switchLeft}>
            <Ionicons name="time-outline" size={17} color={colors.textMuted} />
            <Text style={styles.switchLabel}>Show my last-active time</Text>
          </View>
          <Switch value={showLastActive} onValueChange={setShowLastActive} />
        </View>
        <View style={styles.switchRow}>
          <View style={styles.switchLeft}>
            <Ionicons name="flame" size={17} color={colors.accent} />
            <Text style={styles.switchLabel}>Daily streak reminder</Text>
          </View>
          <Switch value={remindOn} onValueChange={onToggleReminder} />
        </View>
      </Section>

      <Button title="Save profile" onPress={onSave} loading={saving} style={styles.save} />

      <Pressable
        style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
        onPress={onSignOut}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: 48,
    backgroundColor: colors.background,
  },
  pressed: { opacity: 0.8 },
  avatarBlock: { alignItems: 'center', gap: 4, marginBottom: spacing.xs },
  avatarRing: { width: 104, height: 104, borderRadius: 52 },
  avatar: { width: 104, height: 104, borderRadius: 52 },
  avatarPlaceholder: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 40, fontFamily: font.bold },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  avatarEdit: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  email: { fontSize: 18, fontFamily: font.bold, color: colors.text, marginTop: 4 },
  meta: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13 },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    minHeight: 50,
  },
  linkLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkText: { fontSize: 15, fontFamily: font.bold },
  proRow: { backgroundColor: colors.pro },
  proRowActive: {
    backgroundColor: colors.proSoft,
    borderWidth: 1,
    borderColor: colors.pro,
  },
  buddyRow: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  section: { marginTop: spacing.md, gap: 6 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 6,
    ...shadow.card,
  },
  sectionNote: {
    color: colors.textMuted,
    fontFamily: font.regular,
    fontSize: 13,
    marginBottom: 2,
  },
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
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    minHeight: 36,
  },
  switchLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  switchLabel: { fontSize: 15, fontFamily: font.medium, color: colors.text },
  save: { marginTop: spacing.xl },
  signOutButton: {
    borderRadius: radius.sm,
    padding: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
    minHeight: 44,
  },
  signOutText: { color: colors.danger, fontSize: 15, fontFamily: font.semibold },
});
