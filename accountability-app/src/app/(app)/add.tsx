import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { ChipSelector } from '../../profiles/ChipSelector';
import { useIsPro } from '../../pro/ProProvider';
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
} from '../../notifications/api';
import { reminderTriggerDate } from '../../notifications/trigger';
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
  const [saving, setSaving] = useState(false);

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
    try {
      const startsAt = toIsoFromLocal(date, time);
      let reminderId: string | null = null;
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
      router.navigate('/');
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>What is it?</Text>
      <ChipSelector options={TYPE_OPTIONS} value={type} onChange={setType} />

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Buy medicine"
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Details"
        value={note}
        onChangeText={setNote}
        multiline
      />

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            value={date}
            onChangeText={setDate}
          />
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>Time</Text>
          <TextInput
            style={styles.input}
            placeholder="HH:MM"
            autoCapitalize="none"
            value={time}
            onChangeText={setTime}
          />
        </View>
      </View>

      <View style={styles.remindRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.remindTitle}>🔔 Remind me</Text>
          <Text style={styles.remindSub}>Get an alarm at this time</Text>
        </View>
        <Switch value={remind} onValueChange={setRemind} />
      </View>

      {remind && isPro ? (
        <View style={styles.offsetRow}>
          {OFFSET_OPTIONS.map((o) => {
            const selected = offsetMin === o.m;
            return (
              <Pressable
                key={o.m}
                style={[styles.offsetChip, selected && styles.offsetChipSel]}
                onPress={() => setOffsetMin(o.m)}
              >
                <Text style={[styles.offsetText, selected && styles.offsetTextSel]}>
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : remind ? (
        <Pressable style={styles.proHint} onPress={() => router.push('/paywall')}>
          <Text style={styles.proHintText}>
            ⭐ Pro: get reminded earlier (10 min, 1 hour before…)
          </Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.button} onPress={onSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Add to my day</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 8, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  remindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: '#f7f7f9',
    borderRadius: 12,
    padding: 14,
  },
  remindTitle: { fontSize: 15, fontWeight: '700' },
  remindSub: { color: '#666', fontSize: 13, marginTop: 2 },
  offsetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  offsetChip: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  offsetChipSel: { backgroundColor: '#2563eb' },
  offsetText: { color: '#2563eb', fontWeight: '600', fontSize: 13 },
  offsetTextSel: { color: '#fff' },
  proHint: {
    marginTop: 10,
    backgroundColor: '#fffbe6',
    borderColor: '#f0c000',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  proHintText: { color: '#b58900', fontWeight: '600', fontSize: 13 },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
