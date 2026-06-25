import { useEffect, useState } from 'react';
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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { getMyProfile, updateMyProfile, touchLastActive } from '../../profiles/api';
import { validateBirthday } from '../../profiles/validation';
import { uploadAvatar } from '../../profiles/avatar';
import { ChipSelector } from '../../profiles/ChipSelector';
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

export default function Profile() {
  const { session } = useAuth();

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
      Alert.alert('Saved', 'Your profile has been updated.');
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
    } catch (e) {
      Alert.alert('Upload failed', String((e as Error).message ?? e));
    } finally {
      setUploading(false);
    }
  }

  async function onSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Could not sign out', error.message);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.avatarBlock}>
        <Pressable onPress={onPickAvatar} disabled={uploading} style={styles.avatarRing}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>
                {(session?.user.email ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {uploading ? (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </Pressable>
        <Pressable onPress={onPickAvatar} disabled={uploading}>
          <Text style={styles.changePhoto}>
            {avatarUrl ? 'Change photo' : 'Add photo'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.email}>{session?.user.email ?? 'Signed in'}</Text>
      {joinedAt ? (
        <Text style={styles.meta}>
          Joined {new Date(joinedAt).toLocaleDateString()}
        </Text>
      ) : null}

      <Text style={styles.label}>Display name</Text>
      <TextInput
        style={styles.input}
        placeholder="Your name"
        value={displayName}
        onChangeText={setDisplayName}
      />

      <Text style={styles.label}>Area</Text>
      <TextInput
        style={styles.input}
        placeholder="City or region (no exact address)"
        value={area}
        onChangeText={setArea}
      />

      <Text style={styles.label}>Bio</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="A short intro"
        value={bio}
        onChangeText={setBio}
        multiline
      />

      <Text style={styles.sectionNote}>
        The details below are optional and private by default — you choose what to show.
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

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Show my last-active time</Text>
        <Switch value={showLastActive} onValueChange={setShowLastActive} />
      </View>

      <Pressable style={styles.saveButton} onPress={onSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save profile</Text>
        )}
      </Pressable>

      <Pressable style={styles.signOutButton} onPress={onSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 8, paddingBottom: 48 },
  avatarBlock: { alignItems: 'center', gap: 8, marginBottom: 8 },
  avatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    overflow: 'hidden',
  },
  avatar: { width: 104, height: 104, borderRadius: 52 },
  avatarPlaceholder: {
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 40, fontWeight: '700' },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  changePhoto: { color: '#2563eb', fontWeight: '600' },
  email: { fontSize: 18, fontWeight: '700' },
  meta: { color: '#666', marginBottom: 8 },
  sectionNote: { color: '#666', fontSize: 13, marginTop: 16, fontStyle: 'italic' },
  label: { fontSize: 14, fontWeight: '600', marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  switchLabel: { fontSize: 15 },
  saveButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  signOutButton: {
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  signOutText: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
});
