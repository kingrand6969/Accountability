import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
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
import {
  validateTimeString,
  toIsoFromLocal,
  toLocalDateString,
} from '../../timeline/datetime';
import { MonthCalendar } from '../../ui/MonthCalendar';
import { TimePicker } from '../../ui/TimePicker';
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

// Add is for scheduling reminders only — events, meetings, errands, grocery.
// Workouts/meals/money live in their own trackers (Track tab).
const TYPE_OPTIONS: { value: TimelineType; label: string }[] = [
  { value: 'event', label: '📅 Event' },
  { value: 'task', label: '✅ Task' },
  { value: 'grocery', label: '🛒 Groceries' },
  { value: 'other', label: '📌 Other' },
];

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
  const [type, setType] = useState<TimelineType | null>('event');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [checklist, setChecklist] = useState<string[]>([]);
  const [checkText, setCheckText] = useState('');
  const [date, setDate] = useState(() => toLocalDateString(new Date()));
  const [time, setTime] = useState(() => nextHour());
  const [remind, setRemind] = useState(false);
  const [offsetMin, setOffsetMin] = useState(0);
  const [phrase, setPhrase] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  function openForDate(d: string) {
    setDate(d);
    setDetailsOpen(true);
  }

  function onAutoFill() {
    if (!phrase.trim()) return;
    const r = parseVoiceCommand(phrase);
    // Add only schedules events/tasks — clamp anything else to task.
    setType(r.type === 'event' ? 'event' : 'task');
    setTitle(r.title);
    setDate(r.date);
    setTime(r.time);
    setRemind(r.remind);
    setDetailsOpen(true); // pop the details form pre-filled
  }

  // Prefill + open the sheet when opened from a tapped hour on the day grid.
  useEffect(() => {
    if (typeof params.date === 'string' && params.date) setDate(params.date);
    if (typeof params.time === 'string' && params.time) setTime(params.time);
    if (typeof params.date === 'string' && params.date) setDetailsOpen(true);
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
        checklist: checklist.length > 0 ? checklist.map((text) => ({ text, done: false })) : null,
        starts_at: startsAt,
        reminder_id: reminderId,
      });
      setTitle('');
      setNote('');
      setChecklist([]);
      setRemind(false);
      setDetailsOpen(false);
      showToast('Added ✓');
      // land on the day you scheduled it for, so you see it
      router.navigate({ pathname: '/today', params: { date } } as never);
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

      <Text style={styles.calHeading}>Tap a date to add something</Text>
      <MonthCalendar value={date} onChange={openForDate} />

      {/* details popup — opens after a date is chosen */}
      <Modal
        visible={detailsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailsOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{formatDateLabel(date)}</Text>
              <Pressable
                onPress={() => setDetailsOpen(false)}
                hitSlop={8}
                style={({ pressed }) => [styles.sheetClose, pressed && styles.pressed]}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={colors.textFaint} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.sheetScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.label}>What is it?</Text>
              <ChipSelector options={TYPE_OPTIONS} value={type} onChange={setType} />

              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Buy medicine"
                placeholderTextColor={colors.textFaint}
                value={title}
                onChangeText={setTitle}
                autoFocus
              />

              <Text style={styles.label}>Time</Text>
              <TimePicker value={time} onChange={setTime} />

              <Text style={styles.label}>Note (optional)</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Details"
                placeholderTextColor={colors.textFaint}
                value={note}
                onChangeText={setNote}
                multiline
              />

              <Text style={styles.label}>Checklist (optional)</Text>
              {checklist.map((line, i) => (
                <View key={i} style={styles.checkLine}>
                  <Ionicons name="ellipse-outline" size={16} color={colors.textFaint} />
                  <Text style={styles.checkLineText}>{line}</Text>
                  <Pressable
                    onPress={() => setChecklist((c) => c.filter((_, idx) => idx !== i))}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${line}`}
                  >
                    <Ionicons name="close" size={16} color={colors.textFaint} />
                  </Pressable>
                </View>
              ))}
              <View style={styles.checkAddRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Add a checklist item…"
                  placeholderTextColor={colors.textFaint}
                  value={checkText}
                  onChangeText={setCheckText}
                  onSubmitEditing={() => {
                    const t = checkText.trim();
                    if (t) {
                      setChecklist((c) => [...c, t]);
                      setCheckText('');
                    }
                  }}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={() => {
                    const t = checkText.trim();
                    if (t) {
                      setChecklist((c) => [...c, t]);
                      setCheckText('');
                    }
                  }}
                  style={({ pressed }) => [styles.checkAddBtn, pressed && styles.pressed]}
                  accessibilityLabel="Add checklist item"
                >
                  <Ionicons name="add" size={22} color="#fff" />
                </Pressable>
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
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
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
  calHeading: {
    fontSize: 16,
    fontFamily: font.bold,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: 14,
    fontFamily: font.semibold,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: { fontFamily: font.extrabold, fontSize: 18, color: colors.text },
  sheetClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sheetScroll: { padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.sm },
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
  checkLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  checkLineText: { flex: 1, fontFamily: font.regular, fontSize: 14.5, color: colors.text },
  checkAddRow: { flexDirection: 'row', gap: spacing.sm },
  checkAddBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  timeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 36,
    width: 88,
    fontFamily: font.semibold,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    textAlign: 'center',
  },
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
