import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { getMyProfile, updateMyProfile } from '../profiles/api';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../ui/Button';
import { confirmDialog } from '../ui/ConfirmDialog';
import { font, radius, spacing, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BrandMark } from '../ui/BrandMark';
import { createItem, listItemsForDay } from '../timeline/api';
import { persistPromisesForToday } from '../entry/promisePersistence';
import {
  completePromiseSelection,
  createSingleFlight,
  togglePromiseSelection,
} from '../entry/promiseSelection';
import {
  notifyOnboardingComplete,
  onboardingStorageKey,
} from '../navigation/authRouteIntent';

const PROMISES = [
  { id: 'body-run', group: 'Body', icon: 'walk' as const, color: '#2563EB', title: 'Morning run 3.2 km' },
  { id: 'body-strength', group: 'Body', icon: 'barbell' as const, color: '#16A34A', title: 'Strength workout' },
  { id: 'focus-work', group: 'Focus', icon: 'radio-button-on' as const, color: '#7C3AED', title: '90 min deep work' },
  { id: 'people-call', group: 'People', icon: 'people' as const, color: '#EA580C', title: 'Call someone I care about' },
] as const;

/** Per-user flag — a second account on the same device gets its own onboarding. */
export function onboardedKey(userId: string): string {
  return onboardingStorageKey(userId);
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

function PromiseStep({ userId }: { userId: string | null }) {
  const { colors: theme } = useAppTheme();
  const styles = createStyles(theme);
  const [saving, setSaving] = useState(false);
  const [selectedPromises, setSelectedPromises] = useState<Set<string>>(new Set());
  const [promiseError, setPromiseError] = useState<string | null>(null);
  const [promiseLimitNotice, setPromiseLimitNotice] = useState<string | null>(null);
  const completionFlight = useRef(createSingleFlight()).current;
  const activeOwnerRef = useRef(true);
  useEffect(() => () => {
    activeOwnerRef.current = false;
  }, []);
  const isCurrentOwner = () => activeOwnerRef.current;

  function togglePromise(id: string) {
    setPromiseError(null);
    if (!selectedPromises.has(id) && selectedPromises.size >= 3) {
      setPromiseLimitNotice('You can choose up to 3. Remove one to choose another.');
      return;
    }
    setPromiseLimitNotice(null);
    setSelectedPromises((current) => togglePromiseSelection(current, id));
  }

  function finishPromises(skip = false) {
    const expectedOwner = userId;
    return completionFlight.run(async () => {
      if (!skip && selectedPromises.size === 0) return;
      if (!isCurrentOwner()) return;
      setSaving(true);
      setPromiseError(null);
      const result = await completePromiseSelection(
        { userId: expectedOwner, selected: selectedPromises, completion: skip ? 'skip' : 'start' },
        {
          persistTimeline: (selected) =>
            persistPromisesForToday(selected, { listItemsForDay, createItem, isCurrentOwner }),
          setItem: (key, value) => AsyncStorage.setItem(key, value),
          isCurrentOwner,
        },
      );

      if (!isCurrentOwner()) return;
      setSaving(false);
      if (result.outcome === 'noop' || result.outcome === 'detached') return;
      if (result.outcome === 'stay') {
        setPromiseError(result.error);
        return;
      }
      if (!isCurrentOwner()) return;
      if (expectedOwner) notifyOnboardingComplete(expectedOwner);
      if (result.warning) Alert.alert('Saved for this session', result.warning);
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.promiseScreen} keyboardShouldPersistTaps="handled">
      <View style={styles.promiseIntro}>
        <BrandMark size={34} color={theme.ink.action} accessibilityLabel="AccountAbility" />
        <Text accessibilityRole="header" style={styles.promiseTitle}>
          What will you{'\n'}show up for today?
        </Text>
        <Text style={styles.promiseSubtitle}>
          Choose up to 3 promises. Start small—you can add more later.
        </Text>
        <View style={styles.promiseCountRow}>
          <Text style={styles.promiseCount}>{selectedPromises.size} of 3 selected</Text>
          <Text style={styles.promiseEncouragement}>
            {selectedPromises.size === 0
              ? 'Start small'
              : selectedPromises.size === 3
                ? 'Your day is ready'
                : 'Keep it achievable'}
          </Text>
        </View>
      </View>
      <View style={styles.promiseList}>
        {PROMISES.map((promise) => {
          const selected = selectedPromises.has(promise.id);
          return (
            <Pressable
              key={promise.id}
              onPress={() => togglePromise(promise.id)}
              disabled={saving}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled: saving }}
              accessibilityLabel={`${promise.group}: ${promise.title}`}
              accessibilityHint={
                selected
                  ? 'Removes this promise'
                  : selectedPromises.size >= 3
                    ? 'Three promises are already selected'
                    : 'Adds this promise'
              }
              style={({ pressed }) => [
                styles.promiseCard,
                selected && styles.promiseCardSelected,
                pressed && styles.promisePressed,
              ]}
            >
              <View style={[styles.promiseIcon, { backgroundColor: promise.color }]}>
                <Ionicons name={promise.icon} size={21} color="#FFFFFF" />
              </View>
              <View style={styles.promiseCopy}>
                <Text style={styles.promiseGroup}>{promise.group}</Text>
                <Text style={styles.promiseExample}>{promise.title}</Text>
              </View>
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={24}
                color={selected ? theme.ink.action : theme.ink.muted}
              />
            </Pressable>
          );
        })}
      </View>
      {promiseLimitNotice ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.promiseLimitNotice}>
          {promiseLimitNotice}
        </Text>
      ) : null}
      {promiseError ? (
        <View accessibilityRole="alert" style={styles.promiseError}>
          <Text style={styles.promiseErrorTitle}>Couldn&apos;t start your day</Text>
          <Text style={styles.promiseErrorText}>{promiseError}</Text>
          <Button title="Try again" variant="outline" onPress={() => finishPromises(false)}
            disabled={saving || selectedPromises.size === 0} />
        </View>
      ) : null}
      <View style={styles.promiseActions}>
        <Button title="Start my day" onPress={() => finishPromises()}
          disabled={saving || selectedPromises.size === 0} loading={saving} />
        <Pressable onPress={() => finishPromises(true)} style={styles.skipPromises}
          accessibilityRole="button" accessibilityLabel="Skip choosing promises for now"
          disabled={saving} accessibilityState={{ disabled: saving }}>
          <Text style={styles.skipPromisesText}>Skip for now</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const { colors: theme, mode } = useAppTheme();
  const styles = createStyles(theme);
  const { width, fontScale } = useWindowDimensions();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [area, setArea] = useState('');
  const [saving, setSaving] = useState(false);
  const [areaErr, setAreaErr] = useState<string | null>(null);
  const [step, setStep] = useState<'profile' | 'promises'>('profile');
  const stackNameFields = width < 400 || fontScale >= 1.3;

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
      setStep('promises');
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  if (step === 'promises') {
    return (
      <>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <SafeAreaView style={styles.screen}>
          <PromiseStep key={userId ?? 'signed-out'} userId={userId} />
        </SafeAreaView>
      </>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <BrandMark size={62} color={theme.ink.action} accessibilityLabel="AccountAbility" />
      </View>
      <Text style={styles.title}>Welcome to AccountAbility</Text>
      <Text style={styles.subtitle}>
        Plan your day, track workouts, meals and runs — and keep your
        streak alive. Let&apos;s set you up.
      </Text>

      <View style={[styles.nameRow, stackNameFields && styles.nameRowStacked]}>
        <View style={styles.nameCol}>
          <Text style={styles.label}>First name</Text>
          <TextInput
            style={styles.input}
            placeholder="First name"
            placeholderTextColor={theme.ink.muted}
            value={firstName}
            onChangeText={setFirstName}
            autoComplete="given-name"
            textContentType="givenName"
            accessibilityLabel="First name"
            accessibilityHint="Enter your first name, using at least two letters."
          />
        </View>
        <View style={styles.nameCol}>
          <Text style={styles.label}>Last name</Text>
          <TextInput
            style={styles.input}
            placeholder="Last name"
            placeholderTextColor={theme.ink.muted}
            value={lastName}
            onChangeText={setLastName}
            autoComplete="family-name"
            textContentType="familyName"
            accessibilityLabel="Last name"
            accessibilityHint="Enter your last name, using at least two letters."
          />
        </View>
      </View>

      <Text style={styles.label}>Your location</Text>
      <TextInput
        style={[styles.input, areaErr ? styles.inputErr : null]}
        placeholder="City or area — e.g. Cebu City"
        placeholderTextColor={theme.ink.muted}
        value={area}
        onChangeText={(v) => {
          setArea(v);
          if (areaErr) setAreaErr(null);
        }}
        autoComplete="postal-address-locality"
        textContentType="addressCity"
        accessibilityLabel="Your location"
        accessibilityHint="Enter your city or area to help find nearby workout buddies."
        accessibilityValue={areaErr ? { text: `Invalid location: ${areaErr}` } : undefined}
      />
      {areaErr ? (
        <Text
          style={styles.errText}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {areaErr}
        </Text>
      ) : (
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
        <Text
          style={styles.legalLink}
          onPress={() => router.push('/legal/terms')}
          accessibilityRole="link"
          accessibilityLabel="Terms of Service"
          accessibilityHint="Opens the Terms of Service."
        >
          Terms of Service
        </Text>{' '}
        and{' '}
        <Text
          style={styles.legalLink}
          onPress={() => router.push('/legal/privacy')}
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy"
          accessibilityHint="Opens the Privacy Policy."
        >
          Privacy Policy
        </Text>
        .
      </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface.canvas },
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
    backgroundColor: theme.surface.card,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  title: {
    fontSize: 26,
    fontFamily: font.extrabold,
    textAlign: 'center',
    color: theme.ink.primary,
  },
  subtitle: {
    color: theme.ink.muted,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  nameRow: { flexDirection: 'row', gap: 10 },
  nameRowStacked: { flexDirection: 'column' },
  nameCol: { flex: 1, gap: 10 },
  label: { fontSize: 14, fontFamily: font.semibold, color: theme.ink.secondary, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: radius.sm,
    padding: 13,
    fontSize: 16,
    fontFamily: font.regular,
    color: theme.ink.primary,
    backgroundColor: theme.surface.muted,
  },
  inputErr: { borderColor: theme.border.danger },
  errText: { color: theme.status.danger, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
  help: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 12.5, lineHeight: 18 },
  cta: { marginTop: spacing.xl },
  legalRow: {
    color: theme.ink.muted,
    fontFamily: font.regular,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: spacing.md,
  },
  legalLink: { color: theme.ink.action, fontFamily: font.semibold },
  promiseScreen: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: theme.surface.canvas,
    gap: spacing.md,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  promiseIntro: { alignItems: 'center', gap: 5, alignSelf: 'stretch' },
  promiseTitle: {
    marginTop: 2,
    color: theme.ink.primary,
    fontFamily: font.serif,
    fontSize: 31,
    lineHeight: 35,
    textAlign: 'center',
    letterSpacing: -0.7,
  },
  promiseSubtitle: {
    color: theme.ink.muted,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  promiseCountRow: {
    minHeight: 30,
    marginTop: 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: theme.surface.muted,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  promiseCount: { color: theme.ink.action, fontFamily: font.bold, fontSize: 12.5 },
  promiseEncouragement: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 12 },
  promiseList: { alignSelf: 'stretch', gap: 8 },
  promiseCard: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    backgroundColor: theme.surface.card,
  },
  promiseCardSelected: {
    borderColor: theme.border.action,
    borderWidth: 2,
    backgroundColor: theme.surface.muted,
  },
  promiseIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  promiseCopy: { flex: 1, gap: 2 },
  promiseGroup: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 15 },
  promiseExample: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 12.5 },
  promisePressed: { opacity: 0.65 },
  promiseLimitNotice: {
    alignSelf: 'stretch',
    color: theme.status.danger,
    fontFamily: font.semibold,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -4,
  },
  promiseError: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: theme.border.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: theme.status.dangerSoft,
    marginBottom: spacing.sm,
  },
  promiseErrorTitle: { color: theme.status.danger, fontFamily: font.bold, fontSize: 15 },
  promiseErrorText: { color: theme.ink.secondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  promiseActions: { alignSelf: 'stretch', gap: 2, marginTop: 'auto' },
  skipPromises: { minHeight: 48, minWidth: 140, alignItems: 'center', justifyContent: 'center' },
  skipPromisesText: { color: theme.ink.action, fontFamily: font.semibold, fontSize: 14 },
});
