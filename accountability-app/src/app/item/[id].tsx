import { useCallback, useMemo, useRef, useState, type ComponentProps } from 'react';
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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getItem, updateItemChecklist } from '../../timeline/api';
import { typeMeta, formatTime } from '../../timeline/format';
import { EmptyState } from '../../ui/EmptyState';
import {
  font,
  radius,
  spacing,
  contentMax,
  type AppThemeColors,
} from '../../ui/theme';
import { useAppTheme } from '../../ui/AppThemeProvider';
import type { ChecklistItem, TimelineItem } from '../../timeline/types';
import { becameCompleteChecklist } from '../../timeline/completion';
import { createChecklistPersistence } from '../../timeline/checklistPersistence';
import { createItemDetailGeneration } from '../../timeline/itemDetailGeneration';
import { useAuth } from '../../auth/AuthProvider';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { colors: theme } = useAppTheme();
  const palette = useMemo(() => detailPalette(theme), [theme]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [item, setItem] = useState<TimelineItem | null>(null);
  const [list, setList] = useState<ChecklistItem[]>([]);
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(true);
  const persistenceRef = useRef<ReturnType<typeof createChecklistPersistence> | null>(null);
  const generationRef = useRef(createItemDetailGeneration());

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      const identity = `${session?.user.id ?? 'signed-out'}:${id}`;
      const token = generationRef.current.begin(identity);
      let active = true;
      let installedController: ReturnType<typeof createChecklistPersistence> | null = null;
      persistenceRef.current?.dispose();
      persistenceRef.current = null;
      setLoading(true);
      getItem(id)
        .then((it) => {
          if (!active || !generationRef.current.isCurrent(token, identity)) return;
          setItem(it);
          const initial = it?.checklist ?? [];
          setList(initial);
          installedController = it ? createChecklistPersistence(
            initial,
            (next) => updateItemChecklist(it.id, next),
            {
              onLatestSuccess: (_revision, previous, next) => {
                if (!active || !generationRef.current.isCurrent(token, identity)) return;
                if (it.type === 'workout' && becameCompleteChecklist(previous, next)) {
                  router.push({
                    pathname: '/win-card',
                    params: {
                      achievementKind: 'workout',
                      achievementSourceId: it.id,
                      achievementTitle: it.title,
                      autoPrompt: '1',
                    },
                  } as never);
                }
              },
              onLatestFailure: (_revision, committed, error) => {
                if (!active || !generationRef.current.isCurrent(token, identity)) return;
                setList([...committed]);
                Alert.alert('Could not save', String((error as Error).message ?? error));
              },
            },
          ) : null;
          persistenceRef.current = installedController;
        })
        .catch((e) => {
          if (active && generationRef.current.isCurrent(token, identity)) {
            Alert.alert('Could not load', String((e as Error).message ?? e));
          }
        })
        .finally(() => {
          if (active && generationRef.current.isCurrent(token, identity)) setLoading(false);
        });
      return () => {
        active = false;
        generationRef.current.invalidate();
        installedController?.dispose();
        if (persistenceRef.current === installedController) persistenceRef.current = null;
      };
    }, [id, router, session?.user.id]),
  );

  function persist(next: ChecklistItem[]) {
    setList(next);
    void persistenceRef.current?.submit(next).catch(() => undefined);
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
        <ActivityIndicator size="large" color={palette.action} />
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
            hitSlop={11}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: c.done }}
            accessibilityLabel={c.text}
          >
            {c.done ? <Ionicons name="checkmark" size={16} color={palette.onAction} /> : null}
          </Pressable>
          <Text style={[styles.checkText, c.done && styles.checkTextDone]}>{c.text}</Text>
          <Pressable
            onPress={() => removeAt(i)}
            hitSlop={8}
            style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
            accessibilityLabel={`Remove ${c.text}`}
          >
            <Ionicons name="close" size={17} color={palette.placeholder} />
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
          placeholderTextColor={palette.placeholder}
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
          <Ionicons name="add" size={22} color={palette.onAction} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

function detailPalette(theme: AppThemeColors) {
  return {
    background: theme.surface.canvas,
    card: theme.surface.card,
    field: theme.surface.muted,
    text: theme.ink.primary,
    muted: theme.ink.muted,
    placeholder: theme.ink.muted,
    border: theme.border.subtle,
    action: theme.ink.action,
    onAction: theme.ink.inverse,
    success: theme.status.success,
  };
}

function createStyles(theme: AppThemeColors) {
  const palette = detailPalette(theme);
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
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
  title: { fontSize: 20, fontFamily: font.extrabold, color: palette.text },
  when: { fontSize: 13, fontFamily: font.medium, color: palette.muted, marginTop: 2 },
  noteCard: {
    backgroundColor: palette.field,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.bold,
    color: palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  noteText: { fontSize: 15, lineHeight: 22, fontFamily: font.regular, color: palette.text, marginTop: 6 },
  checkHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  progress: { fontFamily: font.bold, fontSize: 12.5, color: palette.action },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 52,
  },
  checkBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: palette.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: palette.success, borderColor: palette.success },
  checkText: { flex: 1, fontSize: 15, fontFamily: font.medium, color: palette.text },
  checkTextDone: { textDecorationLine: 'line-through', color: palette.placeholder },
  removeBtn: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  emptyHint: { fontFamily: font.regular, fontSize: 13, color: palette.muted, marginTop: 2 },
  addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 15,
    fontFamily: font.regular,
    color: palette.text,
    backgroundColor: palette.field,
    minHeight: spacing.touch,
  },
  addBtn: {
    width: spacing.touch,
    height: spacing.touch,
    borderRadius: radius.sm,
    backgroundColor: palette.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  });
}
