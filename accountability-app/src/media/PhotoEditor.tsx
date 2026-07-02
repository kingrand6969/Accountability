import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import { colors, font, radius, spacing } from '../ui/theme';

export type EditedPhoto = { base64: string; uri: string };

/** Mood filters, Snow/IG-style, rendered as tinted overlays and baked into
 *  the final image by view-shot. (True color-matrix filters need Skia/GL —
 *  overlays get us 90% of the vibe with zero native deps.) */
const FILTERS: {
  key: string;
  label: string;
  overlay?: string;
  gradient?: [string, string];
}[] = [
  { key: 'none', label: 'Original' },
  { key: 'warm', label: 'Warm', overlay: 'rgba(251,146,60,0.18)' },
  { key: 'golden', label: 'Golden', gradient: ['rgba(251,191,36,0.25)', 'rgba(217,119,6,0.12)'] },
  { key: 'cool', label: 'Cool', overlay: 'rgba(59,130,246,0.16)' },
  { key: 'sunset', label: 'Sunset', gradient: ['rgba(124,58,237,0.22)', 'rgba(251,113,133,0.22)'] },
  { key: 'fade', label: 'Fade', overlay: 'rgba(255,255,255,0.16)' },
  { key: 'noir', label: 'Noir', overlay: 'rgba(15,23,42,0.35)' },
  { key: 'forest', label: 'Forest', gradient: ['rgba(22,163,74,0.18)', 'rgba(6,78,59,0.16)'] },
];

/**
 * Fullscreen photo editor: pick a mood filter, brand watermark is baked in,
 * returns the final image (base64 + tmp file uri). Native only (view-shot).
 */
export function PhotoEditor({
  uri,
  onDone,
  onCancel,
}: {
  uri: string;
  onDone: (photo: EditedPhoto) => void;
  onCancel: () => void;
}) {
  const frameRef = useRef<View>(null);
  const [filter, setFilter] = useState('none');
  const [saving, setSaving] = useState(false);
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  async function onUse() {
    if (!frameRef.current) return;
    setSaving(true);
    try {
      const [base64, fileUri] = await Promise.all([
        captureRef(frameRef, { format: 'jpg', quality: 0.85, result: 'base64' }),
        captureRef(frameRef, { format: 'jpg', quality: 0.85, result: 'tmpfile' }),
      ]);
      onDone({ base64, uri: fileUri });
    } catch {
      // capture failed — fall back to the raw picked photo (no filter/mark)
      onCancel();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable
            onPress={onCancel}
            hitSlop={8}
            style={({ pressed }) => [styles.topBtn, pressed && styles.pressed]}
            accessibilityLabel="Cancel"
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.topTitle}>Edit photo</Text>
          <View style={styles.topBtn} />
        </View>

        {/* the frame that gets captured — image + filter + watermark */}
        <View style={styles.frameWrap}>
          <View ref={frameRef} collapsable={false} style={styles.frame}>
            <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
            {active.gradient ? (
              <LinearGradient
                colors={active.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            ) : active.overlay ? (
              <View
                style={[StyleSheet.absoluteFill, { backgroundColor: active.overlay }]}
                pointerEvents="none"
              />
            ) : null}
            {/* brand watermark — always on shared photos */}
            <View style={styles.watermark} pointerEvents="none">
              <Ionicons name="flame" size={13} color={colors.accent} />
              <Text style={styles.watermarkText}>ACCOUNTABILITY</Text>
            </View>
          </View>
        </View>

        {/* filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={({ pressed }) => [
                styles.filterChip,
                filter === f.key && styles.filterChipSel,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.filterThumb}>
                <Image source={{ uri }} style={styles.filterThumbImg} resizeMode="cover" />
                {f.gradient ? (
                  <LinearGradient colors={f.gradient} style={StyleSheet.absoluteFill} />
                ) : f.overlay ? (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: f.overlay }]} />
                ) : null}
              </View>
              <Text style={[styles.filterLabel, filter === f.key && styles.filterLabelSel]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable
          onPress={onUse}
          disabled={saving}
          style={({ pressed }) => [styles.useBtn, pressed && styles.pressed, saving && { opacity: 0.6 }]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.useText}>Use photo</Text>
            </>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0f1a', paddingBottom: 24 },
  pressed: { opacity: 0.7 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 54,
    paddingBottom: spacing.sm,
  },
  topBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: '#fff', fontFamily: font.bold, fontSize: 16 },
  frameWrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  frame: {
    aspectRatio: 4 / 5,
    width: '100%',
    borderRadius: radius.md,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  photo: { width: '100%', height: '100%' },
  watermark: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  watermarkText: {
    color: 'rgba(255,255,255,0.95)',
    fontFamily: font.extrabold,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  filters: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.sm },
  filterChip: { alignItems: 'center', gap: 4, padding: 4, borderRadius: radius.sm },
  filterChipSel: { backgroundColor: 'rgba(255,255,255,0.12)' },
  filterThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  filterThumbImg: { width: '100%', height: '100%' },
  filterLabel: { color: 'rgba(255,255,255,0.7)', fontFamily: font.medium, fontSize: 11 },
  filterLabelSel: { color: '#fff', fontFamily: font.bold },
  useBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    minHeight: 52,
  },
  useText: { color: '#fff', fontFamily: font.bold, fontSize: 16 },
});
