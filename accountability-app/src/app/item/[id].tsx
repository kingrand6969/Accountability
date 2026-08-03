import { useCallback, useState, type ComponentProps } from 'react';
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
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getItem, updateItemChecklist } from '../../timeline/api';
import { typeMeta, formatTime } from '../../timeline/format';
import { EmptyState } from '../../ui/EmptyState';
import { showToast } from '../../ui/Toast';
import { colors, font, radius, spacing, contentMax } from '../../ui/theme';
import type { ChecklistItem, TimelineItem } from '../../timeline/types';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<TimelineItem | null>(null);
  const [list, setList] = useState<ChecklistItem[]>([]);
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      getItem(id)
        .then((it) => {
          setItem(it);
          setList(it?.checklist ?? []);
        })
        .catch((e) => Alert.alert('Could not load', String((e as Error).message ?? e)))
        .finally(() => setLoading(false));
    }, [id]),
  );

  async function persist(next: ChecklistItem[]) {
    setList(next);
    if (!id) return;
    try {
      await updateItemChecklist(id, next);
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    }
  }

  function toggle(i: number) {
    persist(list.map((c, idx) => (idx === i ? { ...c, done: !c.done } : c)));
  }
  function removeAt(i: number) {
    persist(list.filter((_, idx) => idx !== i));
  }
  function addLine() {
    const t = newText.trim();
    if (!t) return;
    setNewText('');
    persist([...list, { text: t, done: false }]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!item) {
    return (
      <View style={styles.center}>
        <EmptyState icon="document-outline" title="Not found" />
      </View>
    );
  }

  const meta = typeMeta(item.type);
  const done = list.filter((c) => c.done).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: `${meta.tint}18` }]}>
          <Ionicons name={meta.icon as IoniconName} size={22} color={meta.tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.when}>
            {meta.label} · {formatTime(item.starts_at)}
            {item.reminder_id ? ' · 🔔 reminder set' : ''}
          </Text>
        </View>
      </View>

      {item.note ? (
        <View style={styles.noteCard}>
          <Text style={styles.sectionTitle}>Note</Text>
          <Text style={styles.noteText}>{item.note}</Text>
        </View>
      ) : null}

      <View style={styles.checkHead}>
        <Text style={styles.sectionTitle}>Checklist</Text>
        {list.length > 0 ? (
          <Text style={styles.progress}>
            {done}/{list.length} done
          </Text>
        ) : null}
      </View>

      {list.map((c, i) => (
        <View key={i} style={styles.checkRow}>
          <Pressable
            onPress={() => toggle(i)}
            style={({ pressed }) => [styles.checkBox, c.done && styles.checkBoxOn, pressed && styles.pressed]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: c.done }}
            accessibilityLabel={c.text}
          >
            {c.done ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
          </Pressable>
          <Text style={[styles.checkText, c.done && styles.checkTextDone]}>{c.text}</Text>
          <Pressable
            onPress={() => removeAt(i)}
            hitSlop={8}
            style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
            accessibilityLabel={`Remove ${c.text}`}
          >
            <Ionicons name="close" size={17} color={colors.textFaint} />
          </Pressable>
        </View>
      ))}

      {list.length === 0 ? (
        <Text style={styles.emptyHint}>No checklist yet — add items below.</Text>
      ) : null}

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Add a checklist item…"
          placeholderTextColor={colors.textFaint}
          value={newText}
          onChangeText={setNewText}
          onSubmitEditing={addLine}
          returnKeyType="done"
        />
        <Pressable
          onPress={addLine}
          style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
          accessibilityLabel="Add checklist item"
        >
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 48, ...contentMax },
  pressed: { opacity: 0.7 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontFamily: font.extrabold, color: colors.text },
  when: { fontSize: 13, fontFamily: font.medium, color: colors.textMuted, marginTop: 2 },
  noteCard: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  noteText: { fontSize: 15, lineHeight: 22, fontFamily: font.regular, color: colors.text, marginTop: 6 },
  checkHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  progress: { fontFamily: font.bold, fontSize: 12.5, color: colors.primary },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 52,
  },
  checkBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: colors.success, borderColor: colors.success },
  checkText: { flex: 1, fontSize: 15, fontFamily: font.medium, color: colors.text },
  checkTextDone: { textDecorationLine: 'line-through', color: colors.textFaint },
  removeBtn: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  emptyHint: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    minHeight: 48,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
