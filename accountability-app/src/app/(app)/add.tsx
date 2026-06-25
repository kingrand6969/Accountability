import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChipSelector } from '../../profiles/ChipSelector';
import { createItem } from '../../timeline/api';
import { TIMELINE_TYPES } from '../../timeline/format';
import {
  validateDateString,
  validateTimeString,
  toIsoFromLocal,
  toLocalDateString,
} from '../../timeline/datetime';
import type { TimelineType } from '../../timeline/types';

const TYPE_OPTIONS = TIMELINE_TYPES.map((t) => ({
  value: t.value,
  label: `${t.emoji} ${t.label}`,
}));

function nextHour(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return `${d.getHours().toString().padStart(2, '0')}:00`;
}

export default function Add() {
  const router = useRouter();
  const [type, setType] = useState<TimelineType | null>('task');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => toLocalDateString(new Date()));
  const [time, setTime] = useState(() => nextHour());
  const [saving, setSaving] = useState(false);

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
      await createItem({
        type,
        title: title.trim(),
        note: note.trim() || null,
        starts_at: toIsoFromLocal(date, time),
      });
      setTitle('');
      setNote('');
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
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
