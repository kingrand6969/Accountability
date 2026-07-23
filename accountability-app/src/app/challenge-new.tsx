import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { GlassBackdrop, GlassCard } from '../ui/Glass';
import { contentMaxWidth } from '../ui/responsive';
import { font, radius, spacing } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { Chips, INK, INK_SOFT, ACCENT } from '../compete/CompeteUI';
import { CHALLENGE_METRICS, createChallenge, type Metric } from '../compete/api';

const metricOpts = CHALLENGE_METRICS.map((m) => ({ value: m.value, label: m.label, icon: m.icon }));
const DAYS = [
  { value: '7', label: '1 week' },
  { value: '14', label: '2 weeks' },
  { value: '30', label: '1 month' },
];

export default function ChallengeNew() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const colMax = contentMaxWidth(width);
  const bgRef = useRef<View>(null);
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState<Metric>('consistency');
  const [days, setDays] = useState('7');
  const [saving, setSaving] = useState(false);

  async function onCreate() {
    if (!title.trim()) {
      Alert.alert('Name your challenge', 'Give it a title people will recognise.');
      return;
    }
    setSaving(true);
    try {
      const id = await createChallenge({ title, metric, days: parseInt(days, 10) });
      showToast('Challenge created — invite your buddies! 🏆');
      router.replace({ pathname: '/challenge/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Could not create', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <GlassBackdrop ref={bgRef} columnWidth={colMax} />
      <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: colMax }]} keyboardShouldPersistTaps="handled">
        <GlassCard style={styles.card}>
          <View style={styles.pad}>
            <Text style={styles.label}>Challenge name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. October Consistency Sprint"
              placeholderTextColor={INK_SOFT}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />

            <Text style={styles.label}>Compete on</Text>
            <Chips options={metricOpts} value={metric} onChange={(v) => setMetric(v as Metric)} />
            <Text style={styles.hint}>{metricHint(metric)}</Text>

            <Text style={styles.label}>Length</Text>
            <Chips options={DAYS} value={days} onChange={setDays} />
          </View>
        </GlassCard>

        <Pressable
          style={({ pressed }) => [styles.createBtn, pressed && styles.pressed]}
          onPress={onCreate}
          disabled={saving}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createText}>Create challenge</Text>
          )}
        </Pressable>
        <Text style={styles.footNote}>Anyone can join once it&apos;s live. You&apos;ll be entered automatically.</Text>
      </ScrollView>
    </View>
  );
}

function metricHint(m: Metric): string {
  if (m === 'distance') return 'Ranked by total kilometres from GPS runs & walks.';
  if (m === 'points') return 'A blend of active days, distance, and workouts logged.';
  return 'Ranked by how many days each person shows up.';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60, width: '100%', alignSelf: 'center' },
  pressed: { opacity: 0.7 },
  card: {},
  pad: { padding: spacing.lg, gap: spacing.sm },
  label: { fontFamily: font.bold, fontSize: 13, color: INK, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(30,27,75,0.15)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 15.5,
    fontFamily: font.regular,
    color: INK,
    minHeight: 48,
  },
  hint: { fontFamily: font.medium, fontSize: 12.5, color: INK_SOFT, lineHeight: 17 },
  createBtn: {
    backgroundColor: ACCENT,
    borderRadius: radius.pill,
    paddingVertical: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createText: { color: '#fff', fontFamily: font.bold, fontSize: 16 },
  footNote: { fontFamily: font.medium, fontSize: 12, color: INK_SOFT, textAlign: 'center' },
});
