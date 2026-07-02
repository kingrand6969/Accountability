import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChipSelector } from '../../profiles/ChipSelector';
import { useIsPro } from '../../pro/ProProvider';
import { parseVoiceCommand } from '../../voice/parse';
import { createItem } from '../../timeline/api';
import { TIMELINE_TYPES } from '../../timeline/format';
import {
  validateDateString,
  validateTimeString,
  toIsoFromLocal,
  toLocalDateString,
} from '../../timeline/datetime';
import {
  ensureNotificationPermission,
  scheduleReminder,
  cancelReminder,
} from '../../notifications/api';
import { reminderTriggerDate } from '../../notifications/trigger';
import { Button } from '../../ui/Button';
import { showToast } from '../../ui/Toast';
import { colors, font, radius, spacing } from '../../ui/theme';
import type { TimelineType } from '../../timeline/types';

const TYPE_OPTIONS = TIMELINE_TYPES.map((t) => ({
  value: t.value,
  label: `${t.emoji} ${t.label}`,
}));

const OFFSET_OPTIONS = [
  { m: 0, label: 'At time' },
  { m: 10, label: '10 min before' },
  { m: 30, label: '30 min before' },
  { m: 60, label: '1 hour before' },
];

function nextHour(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return `${d.getHours().toString().padStart(2, '0')}:00`;
}

function dayString(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toLocalDateString(d);
}

const DATE_PRESETS = [
  { label: 'Today', get: () => dayString(0) },
  { label: 'Tomorrow', get: () => dayString(1) },
];

const TIME_PRESETS = [
  { label: 'Morning', value: '08:00' },
  { label: 'Noon', value: '12:00' },
  { label: 'Evening', value: '18:00' },
  { label: 'Next hour', get: nextHour },
];

function PresetChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.presetChip,
        selected && styles.presetChipSel,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.presetText, selected && styles.presetTextSel]}>{label}</Text>
    </Pressable>
  );
}

export default function Add() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; time?: string }>();
  const { isPro } = useIsPro();
  const [type, setType] = useState<TimelineType | null>('task');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => toLocalDateString(new Date()));
  const [time, setTime] = useState(() => nextHour());
  const [remind, setRemind] = useState(false);
  const [offsetMin, setOffsetMin] = useState(0);
  const [phrase, setPhrase] = useState('');
  const [saving, setSaving] = useState(false);

  function onAutoFill() {
    if (!phrase.trim()) return;
    const r = parseVoiceCommand(phrase);
    setType(r.type);
    setTitle(r.title);
    setDate(r.date);
    setTime(r.time);
    setRemind(r.remind);
  }

  // Prefill date/time when opened from a tapped hour on the day grid.
  useEffect(() => {
    if (typeof params.date === 'string' && params.date) setDate(params.date);
    if (typeof params.time === 'string' && params.time) setTime(params.time);
  }, [params.date, params.time]);

  async function onSave() {
    if (!type) {
      Alert.alert('Pick a type', 'Choose what kind of thing this is.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Add a title', 'Give it a short name.');
      return;
    }
    const dateError = validateDateString(date);
    if (dateError) {
      Alert.alert('Check the date', dateError);
      return;
    }
    const timeError = validateTimeString(time);
    if (timeError) {
      Alert.alert('Check the time', timeError);
      return;
    }
    setSaving(true);
    let reminderId: string | null = null;
    try {
      const startsAt = toIsoFromLocal(date, time);
      if (remind) {
        const granted = await ensureNotificationPermission();
        if (!granted && Platform.OS !== 'web') {
          Alert.alert(
            'Reminders need permission',
            'Enable notifications in settings to get alarms.',
          );
        } else {
          const effectiveOffset = isPro ? offsetMin : 0;
          const remindIso = new Date(
            new Date(startsAt).getTime() - effectiveOffset * 60000,
          ).toISOString();
          const trigger = reminderTriggerDate(remindIso);
          if (trigger) {
            reminderId = await scheduleReminder(
              title.trim(),
              note.trim() || 'Time for this!',
              trigger,
            );
          } else if (Platform.OS !== 'web') {
            Alert.alert(
              'No alarm set',
              'That time is in the past, so no reminder was scheduled.',
            );
          }
        }
      }
      await createItem({
        type,
        title: title.trim(),
        note: note.trim() || null,
        starts_at: startsAt,
        reminder_id: reminderId,
      });
      setTitle('');
      setNote('');
      setRemind(false);
      showToast('Added to your day ✓');
      router.navigate('/');
    } catch (e) {
      // Don't leave an alarm ringing for an item that was never saved.
      if (reminderId) cancelReminder(reminderId).catch(() => {});
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {isPro ? (
        <View style={styles.quickBox}>
          <View style={styles.quickTitleRow}>
            <Ionicons name="mic-outline" size={17} color={colors.primary} />
            <Text style={styles.quickTitle}>Quick add</Text>
          </View>
          <Text style={styles.quickHint}>
            Type, or tap the mic on your keyboard and speak — then “Auto-fill”.
          </Text>
          <TextInput
            style={[styles.input, styles.quickInput]}
            placeholder="e.g. Remind me to buy medicine tomorrow at 5pm"
            placeholderTextColor={colors.textFaint}
            value={phrase}
            onChangeText={setPhrase}
            multiline
          />
          <Pressable
            style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed]}
            onPress={onAutoFill}
          >
            <Ionicons name="arrow-down" size={15} color="#fff" />
            <Text style={styles.quickBtnText}>Auto-fill</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.proHint, pressed && styles.pressed]}
          onPress={() => router.push('/paywall')}
        >
          <Ionicons name="star" size={15} color={colors.pro} />
          <Text style={styles.proHintText}>
            Pro: Quick add by voice — say “remind me to…” and we fill it in.
          </Text>
        </Pressable>
      )}

      <Text style={styles.label}>What is it?</Text>
      <ChipSelector options={TYPE_OPTIONS} value={type} onChange={setType} />

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Buy medicine"
        placeholderTextColor={colors.textFaint}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Details"
        placeholderTextColor={colors.textFaint}
        value={note}
        onChangeText={setNote}
        multiline
      />

      <Text style={styles.label}>When?</Text>
      <View style={styles.presetRow}>
        {DATE_PRESETS.map((p) => (
          <PresetChip
            key={p.label}
            label={p.label}
            selected={date === p.get()}
            onPress={() => setDate(p.get())}
          />
        ))}
      </View>
      <View style={styles.row}>
        <View style={styles.col}>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            value={date}
            onChangeText={setDate}
          />
        </View>
        <View style={styles.col}>
          <TextInput
            style={styles.input}
            placeholder="HH:MM"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            value={time}
            onChangeText={setTime}
          />
        </View>
      </View>
      <View style={styles.presetRow}>
        {TIME_PRESETS.map((p) => {
          const v = 'value' in p && p.value ? p.value : p.get!();
          return (
            <PresetChip
              key={p.label}
              label={p.label}
              selected={time === v}
              onPress={() => setTime(v)}
            />
          );
        })}
      </View>

      <View style={styles.remindRow}>
        <Ionicons name="notifications-outline" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.remindTitle}>Remind me</Text>
          <Text style={styles.remindSub}>Get an alarm at this time</Text>
        </View>
        <Switch value={remind} onValueChange={setRemind} />
      </View>

      {remind && isPro ? (
        <View style={styles.presetRow}>
          {OFFSET_OPTIONS.map((o) => (
            <PresetChip
              key={o.m}
              label={o.label}
              selected={offsetMin === o.m}
              onPress={() => setOffsetMin(o.m)}
            />
          ))}
        </View>
      ) : remind ? (
        <Pressable
          style={({ pressed }) => [styles.proHint, pressed && styles.pressed]}
          onPress={() => router.push('/paywall')}
        >
          <Ionicons name="star" size={15} color={colors.pro} />
          <Text style={styles.proHintText}>
            Pro: get reminded earlier (10 min, 1 hour before…)
          </Text>
        </Pressable>
      ) : null}

      <Button
        title="Add to my day"
        onPress={onSave}
        loading={saving}
        style={styles.save}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    gap: spacing.sm,
    paddingBottom: 40,
    backgroundColor: colors.background,
  },
  pressed: { opacity: 0.7 },
  quickBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  quickTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quickTitle: { fontSize: 15, fontFamily: font.bold, color: colors.text },
  quickHint: { color: colors.textMuted, fontFamily: font.regular, fontSize: 12.5 },
  quickInput: { backgroundColor: colors.card, minHeight: 44 },
  quickBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    minHeight: 40,
  },
  quickBtnText: { color: '#fff', fontFamily: font.bold, fontSize: 14 },
  label: {
    fontSize: 14,
    fontFamily: font.semibold,
    color: colors.textSecondary,
    marginTop: spacing.md,
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
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: 6 },
  col: { flex: 1 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 6 },
  presetChip: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
  },
  presetChipSel: { backgroundColor: colors.primary },
  presetText: { color: colors.primary, fontFamily: font.semibold, fontSize: 13 },
  presetTextSel: { color: '#fff' },
  remindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  remindTitle: { fontSize: 15, fontFamily: font.bold, color: colors.text },
  remindSub: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  proHint: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.proSoft,
    borderColor: colors.pro,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 44,
  },
  proHintText: {
    color: colors.pro,
    fontFamily: font.semibold,
    fontSize: 13,
    flexShrink: 1,
  },
  save: { marginTop: spacing.xl },
});
