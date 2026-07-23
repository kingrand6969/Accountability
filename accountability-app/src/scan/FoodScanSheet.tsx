import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FoodItem, FoodScan } from './api';
import { colors, font, radius, spacing } from '../ui/theme';

/**
 * Review sheet for a scanned meal.
 *
 * The AI ESTIMATES portions from a photo — it cannot weigh food. So nothing is
 * written to the diet log until the member has seen and (optionally) corrected
 * the numbers here. Editing grams rescales that item's calories and macros
 * proportionally, which is the correction people actually want to make
 * ("that was more like half a cup").
 */
export function FoodScanSheet({
  scan,
  saving,
  onCancel,
  onSave,
}: {
  scan: FoodScan | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (items: FoodItem[]) => void;
}) {
  const [items, setItems] = useState<FoodItem[]>(scan?.items ?? []);
  const [dropped, setDropped] = useState<Set<number>>(new Set());

  // re-seed when a new scan arrives
  const [seed, setSeed] = useState(scan);
  if (scan !== seed) {
    setSeed(scan);
    setItems(scan?.items ?? []);
    setDropped(new Set());
  }

  const kept = items.filter((_, i) => !dropped.has(i));
  const totals = kept.reduce(
    (a, it) => ({
      kcal: a.kcal + (it.kcal || 0),
      protein: a.protein + (it.protein || 0),
      carbs: a.carbs + (it.carbs || 0),
      fat: a.fat + (it.fat || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  /** Editing the portion rescales that item's nutrition proportionally. */
  function setGrams(index: number, text: string) {
    const grams = Math.max(0, parseInt(text.replace(/[^0-9]/g, ''), 10) || 0);
    setItems((cur) =>
      cur.map((it, i) => {
        if (i !== index) return it;
        const base = it.grams || 1;
        const k = grams / base;
        return {
          ...it,
          grams,
          kcal: Math.round((it.kcal || 0) * k),
          protein: Math.round((it.protein || 0) * k),
          carbs: Math.round((it.carbs || 0) * k),
          fat: Math.round((it.fat || 0) * k),
        };
      }),
    );
  }

  return (
    <Modal visible={!!scan} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>Scanned meal</Text>
            <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textFaint} />
            </Pressable>
          </View>

          <Text style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} /> These
            are estimates from your photo — tap a portion to correct it before saving.
          </Text>

          {items.length === 0 ? (
            <Text style={styles.empty}>
              {scan?.note ?? 'No food was recognised in that photo. Try a clearer, well-lit shot.'}
            </Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={{ gap: 10 }}>
              {items.map((it, i) => {
                const off = dropped.has(i);
                return (
                  <View key={`${it.name}-${i}`} style={[styles.row, off && styles.rowOff]}>
                    <Pressable
                      onPress={() =>
                        setDropped((cur) => {
                          const next = new Set(cur);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                      hitSlop={8}
                      accessibilityLabel={off ? `Include ${it.name}` : `Remove ${it.name}`}
                      style={styles.check}
                    >
                      <Ionicons
                        name={off ? 'ellipse-outline' : 'checkmark-circle'}
                        size={22}
                        color={off ? colors.textFaint : colors.success}
                      />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {it.name}
                      </Text>
                      <Text style={styles.macros}>
                        {it.kcal} kcal · P {it.protein} · C {it.carbs} · F {it.fat}
                      </Text>
                    </View>
                    <View style={styles.gramsWrap}>
                      <TextInput
                        value={String(it.grams ?? 0)}
                        onChangeText={(t) => setGrams(i, t)}
                        keyboardType="number-pad"
                        style={styles.grams}
                        accessibilityLabel={`Portion in grams for ${it.name}`}
                        editable={!off}
                      />
                      <Text style={styles.gramsUnit}>g</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {kept.length > 0 ? (
            <View style={styles.totals}>
              <Text style={styles.totalKcal}>{totals.kcal} kcal</Text>
              <Text style={styles.totalMacros}>
                P {totals.protein}g · C {totals.carbs}g · F {totals.fat}g
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => onSave(kept)}
            disabled={kept.length === 0 || saving}
            style={({ pressed }) => [
              styles.save,
              (kept.length === 0 || saving) && styles.saveOff,
              pressed && { opacity: 0.9 },
            ]}
            accessibilityLabel="Add to today's food log"
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>
                Add {kept.length > 0 ? `${kept.length} item${kept.length === 1 ? '' : 's'}` : ''} to
                today
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
    maxHeight: '86%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 4,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: font.extrabold, fontSize: 18, color: colors.text },
  disclaimer: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textMuted,
  },
  list: { maxHeight: 320 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  rowOff: { opacity: 0.45 },
  check: { width: 26, alignItems: 'center' },
  name: { fontFamily: font.semibold, fontSize: 14.5, color: colors.text },
  macros: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  gramsWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  grams: {
    minWidth: 54,
    textAlign: 'right',
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 2,
  },
  gramsUnit: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted },
  totals: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  totalKcal: { fontFamily: font.extrabold, fontSize: 20, color: colors.text },
  totalMacros: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted },
  empty: {
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textMuted,
    paddingVertical: spacing.lg,
  },
  save: {
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveOff: { opacity: 0.5 },
  saveText: { fontFamily: font.bold, fontSize: 15.5, color: colors.onPrimary },
});
