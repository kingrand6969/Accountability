import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { getMyProfile, updateMyProfile, touchLastActive } from '../../profiles/api';
import { validateBirthday } from '../../profiles/validation';
import type { RelationshipStatus } from '../../profiles/types';

const RELATIONSHIP_OPTIONS: { value: RelationshipStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'in_relationship', label: 'In a relationship' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export default function Profile() {
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [joinedAt, setJoinedAt] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [area, setArea] = useState('');
  const [bio, setBio] = useState('');
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
        setDisplayName(p.display_name ?? '');
        setArea(p.area ?? '');
        setBio(p.bio ?? '');
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
      <View style={styles.options}>
        {RELATIONSHIP_OPTIONS.map((opt) => {
          const selected = relationship === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => setRelationship(selected ? null : opt.value)}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
  email: { fontSize: 18, fontWeight: '700' },
  meta: { color: '#666', marginBottom: 8 },
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
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  option: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  optionSelected: { backgroundColor: '#2563eb' },
  optionText: { color: '#2563eb', fontWeight: '600' },
  optionTextSelected: { color: '#fff' },
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
