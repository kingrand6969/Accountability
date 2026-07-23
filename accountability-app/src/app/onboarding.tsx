import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { getMyProfile, updateMyProfile } from '../profiles/api';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../ui/Button';
import { confirmDialog } from '../ui/ConfirmDialog';
import { colors, font, radius, spacing } from '../ui/theme';

/** Per-user flag — a second account on the same device gets its own onboarding. */
export function onboardedKey(userId: string): string {
  return `onboarded:${userId}`;
}

/** A believable name part: at least 2 letters (unicode), spaces/'-. allowed. */
function validNamePart(v: string): boolean {
  const t = v.trim();
  return t.length >= 2 && /^[\p{L}][\p{L}'’. -]*$/u.test(t) && /\p{L}.*\p{L}/u.test(t);
}

/**
 * Sanity-checks the typed area and, WHERE POSSIBLE, enriches it via the map
 * geocoder (Apple Maps on iOS / Google Play Services on Android).
 *
 * There is no curated city list — and deliberately so. A geocoder miss must
 * NEVER block a real member: it doesn't run on web at all, it needs Play
 * Services on Android, and it simply doesn't know plenty of real towns,
 * barangays and districts. Blocking on it once rejected "Las Piñas", a city of
 * 600k people. So:
 *   'junk'       → obviously not a place (empty, no letters) → inline error
 *   'ok'         → geocoder found it; label normalised to "City, Country"
 *   'unverified' → geocoder unavailable or didn't know it → the caller asks the
 *                  member to confirm, and their answer wins
 */
type AreaCheck = { status: 'ok' | 'junk' | 'unverified'; label: string };

async function resolveArea(text: string): Promise<AreaCheck> {
  const typed = text.trim().replace(/\s+/g, ' ');
  // the only hard rejection: not even plausibly a written place name
  if (typed.length < 2 || !/\p{L}\p{L}/u.test(typed)) return { status: 'junk', label: typed };
  // geocoding is a native-only capability — the web build has no geocoder at
  // all, so trust the member rather than nagging every single web signup
  if (Platform.OS === 'web') return { status: 'ok', label: typed };
  try {
    const hits = await Location.geocodeAsync(typed);
    if (!hits.length) return { status: 'unverified', label: typed };
    try {
      const places = await Location.reverseGeocodeAsync({
        latitude: hits[0].latitude,
        longitude: hits[0].longitude,
      });
      const p = places[0];
      const city = p?.city || p?.subregion || p?.region;
      const tail = p?.country && p.country !== city ? p.country : p?.region;
      if (city) return { status: 'ok', label: tail && tail !== city ? `${city}, ${tail}` : city };
    } catch {
      /* normalisation is optional */
    }
    return { status: 'ok', label: typed };
  } catch {
    return { status: 'unverified', label: typed }; // geocoder unavailable
  }
}

export default function Onboarding() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [area, setArea] = useState('');
  const [saving, setSaving] = useState(false);
  const [areaErr, setAreaErr] = useState<string | null>(null);

  // Returning member on a new device? Pre-fill what we already know.
  useEffect(() => {
    getMyProfile()
      .then((p) => {
        if (!p) return;
        if (p.display_name) {
          const [first, ...rest] = p.display_name.split(' ');
          setFirstName((v) => v || first);
          setLastName((v) => v || rest.join(' '));
        }
        if (p.area) setArea((v) => v || p.area || '');
      })
      .catch(() => {});
  }, []);

  async function markDone() {
    if (userId) {
      try {
        await AsyncStorage.setItem(onboardedKey(userId), '1');
      } catch {
        // storage failure shouldn't trap the user on this screen
      }
    }
  }

  async function finish() {
    if (!validNamePart(firstName)) {
      Alert.alert('Your first name', 'Please enter your real first name (at least 2 letters).');
      return;
    }
    if (!validNamePart(lastName)) {
      Alert.alert('Your last name', 'Please enter your real last name (at least 2 letters).');
      return;
    }
    setSaving(true);
    setAreaErr(null);
    try {
      const check = await resolveArea(area);
      if (check.status === 'junk') {
        setAreaErr('Please enter your city or area.');
        setSaving(false);
        return;
      }
      if (check.status === 'unverified') {
        // Our map service didn't recognise it — that is OFTEN the map's fault,
        // not the member's (small towns, districts, spelling variants). Ask,
        // never block: their answer wins.
        setSaving(false);
        confirmDialog({
          title: `Use “${check.label}”?`,
          message:
            'Our map service didn’t recognise this place, but it doesn’t know every town or district. If it’s right, keep it.',
          confirmLabel: 'Use this location',
          destructive: false,
          onConfirm: () => void saveProfile(check.label),
        });
        return;
      }
      setArea(check.label);
      await saveProfile(check.label);
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
      setSaving(false);
    }
  }

  async function saveProfile(areaLabel: string) {
    setSaving(true);
    try {
      await updateMyProfile({
        display_name: `${firstName.trim().replace(/\s+/g, ' ')} ${lastName.trim().replace(/\s+/g, ' ')}`,
        area: areaLabel,
      });
      await markDone();
      router.replace('/');
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Image source={require('../../assets/images/logo.png')} style={styles.heroLogo} />
      </View>
      <Text style={styles.title}>Welcome to AccountAbility</Text>
      <Text style={styles.subtitle}>
        Plan your day, track workouts, food, money and runs — and keep your
        streak alive. Let&apos;s set you up.
      </Text>

      <View style={styles.nameRow}>
        <View style={styles.nameCol}>
          <Text style={styles.label}>First name</Text>
          <TextInput
            style={styles.input}
            placeholder="First name"
            placeholderTextColor={colors.textFaint}
            value={firstName}
            onChangeText={setFirstName}
            autoComplete="given-name"
            textContentType="givenName"
          />
        </View>
        <View style={styles.nameCol}>
          <Text style={styles.label}>Last name</Text>
          <TextInput
            style={styles.input}
            placeholder="Last name"
            placeholderTextColor={colors.textFaint}
            value={lastName}
            onChangeText={setLastName}
            autoComplete="family-name"
            textContentType="familyName"
          />
        </View>
      </View>

      <Text style={styles.label}>Your location</Text>
      <TextInput
        style={[styles.input, areaErr ? styles.inputErr : null]}
        placeholder="City or area — e.g. Cebu City"
        placeholderTextColor={colors.textFaint}
        value={area}
        onChangeText={(v) => {
          setArea(v);
          if (areaErr) setAreaErr(null);
        }}
        autoComplete="postal-address-locality"
        textContentType="addressCity"
      />
      {areaErr ? <Text style={styles.errText}>{areaErr}</Text> : (
        <Text style={styles.help}>Your city or area — used to match you with workout buddies nearby.</Text>
      )}

      <Button
        title={saving ? 'Checking your location…' : 'Get started'}
        onPress={finish}
        loading={saving}
        style={styles.cta}
      />

      <Text style={styles.legalRow}>
        By continuing you agree to our{' '}
        <Text style={styles.legalLink} onPress={() => router.push('/legal/terms')}>
          Terms of Service
        </Text>{' '}
        and{' '}
        <Text style={styles.legalLink} onPress={() => router.push('/legal/privacy')}>
          Privacy Policy
        </Text>
        .
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xxl,
    gap: 10,
    flexGrow: 1,
    justifyContent: 'center',
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    alignSelf: 'center',
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: '#fffffc',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  heroLogo: { width: 70, height: 70 },
  title: {
    fontSize: 26,
    fontFamily: font.extrabold,
    textAlign: 'center',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  nameRow: { flexDirection: 'row', gap: 10 },
  nameCol: { flex: 1, gap: 10 },
  label: { fontSize: 14, fontFamily: font.semibold, color: colors.textSecondary, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 13,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  inputErr: { borderColor: colors.danger },
  errText: { color: colors.danger, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
  help: { color: colors.textFaint, fontFamily: font.regular, fontSize: 12.5, lineHeight: 18 },
  cta: { marginTop: spacing.xl },
  legalRow: {
    color: colors.textMuted,
    fontFamily: font.regular,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: spacing.md,
  },
  legalLink: { color: colors.primary, fontFamily: font.semibold },
});
