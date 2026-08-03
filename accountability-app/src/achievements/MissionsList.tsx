import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassCard } from '../ui/Glass';
import { type MissionState } from './missions';
import { MissionIcon } from './MissionIcon';
import { missionArtFor } from './missionArt';
import { font, radius, spacing } from '../ui/theme';
import { INK, INK_SOFT, ACCENT } from '../compete/CompeteUI';

const DONE = '#16a34a';

/** The member's missions as a tidy list. The flex mission carries a "Flex now"
 *  button; the selfie mission shows its 2/5/10/25 km milestone pips. */
export function MissionsList({
  states,
  onFlex,
  flexing,
}: {
  states: MissionState[] | null;
  onFlex: () => void;
  flexing?: boolean;
}) {
  if (states === null) {
    return (
      <GlassCard>
        <View style={{ padding: spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator color={ACCENT} />
        </View>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <View style={styles.list}>
        {states.map((s, i) => (
          <View key={s.def.id} style={[styles.row, i > 0 && styles.rowDivider]}>
            {(() => {
              const art = missionArtFor(s.def.id);
              if (!art) {
                // family without dedicated art — keep the original badge
                return (
                  <View style={[styles.icon, s.completed && styles.iconDone]}>
                    <Ionicons
                      name={s.completed ? 'checkmark' : s.def.icon}
                      size={20}
                      color={s.completed ? DONE : ACCENT}
                    />
                  </View>
                );
              }
              return (
                <View style={styles.artWrap}>
                  <MissionIcon source={art} size={46} animated={!s.completed} />
                  {s.completed ? (
                    <View style={styles.doneChip}>
                      <Ionicons name="checkmark" size={11} color="#fff" />
                    </View>
                  ) : null}
                </View>
              );
            })()}

            <View style={{ flex: 1 }}>
              <View style={styles.top}>
                <Text style={styles.title} numberOfLines={1}>
                  {s.def.title}
                </Text>
                <Text style={[styles.reward, s.completed && { color: DONE }]}>
                  {s.completed ? 'Earned ✓' : `+${s.def.points} pts`}
                </Text>
              </View>
              <Text style={styles.desc} numberOfLines={2}>
                {s.def.desc}
              </Text>

              {s.def.milestones ? (
                <View style={styles.pips}>
                  {s.def.milestones.map((m) => {
                    const hit = s.value >= m;
                    return (
                      <View key={m} style={[styles.pip, hit && styles.pipHit]}>
                        <Text style={[styles.pipText, hit && styles.pipTextHit]}>{m}km</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${Math.round(s.progress * 100)}%` },
                      s.completed && { backgroundColor: DONE },
                    ]}
                  />
                </View>
              )}

              <View style={styles.bottom}>
                <Text style={styles.label}>{s.label}</Text>
                {s.def.cta === 'flex' && !s.completed ? (
                  <Pressable
                    onPress={onFlex}
                    disabled={flexing}
                    style={({ pressed }) => [styles.flexBtn, pressed && { opacity: 0.8 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Flex your rank to your buddies"
                  >
                    {flexing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.flexBtnText}>Flex now</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.md, paddingVertical: 4 },
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, alignItems: 'flex-start' },
  rowDivider: { borderTopWidth: 1, borderTopColor: 'rgba(30,27,75,0.08)' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(37,99,235,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  iconDone: { backgroundColor: 'rgba(22,163,74,0.14)' },
  artWrap: { width: 46, height: 46, marginTop: 1 },
  doneChip: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: DONE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontFamily: font.bold, fontSize: 15, color: INK },
  reward: { fontFamily: font.extrabold, fontSize: 12.5, color: ACCENT },
  desc: { fontFamily: font.regular, fontSize: 12.5, color: INK_SOFT, marginTop: 1 },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(30,27,75,0.1)',
    overflow: 'hidden',
    marginTop: 8,
  },
  fill: { height: 7, borderRadius: 4, backgroundColor: ACCENT },
  pips: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  pip: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(30,27,75,0.07)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pipHit: { backgroundColor: 'rgba(37,99,235,0.14)', borderColor: 'rgba(37,99,235,0.35)' },
  pipText: { fontFamily: font.bold, fontSize: 11.5, color: INK_SOFT },
  pipTextHit: { color: ACCENT },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 8 },
  label: { flex: 1, fontFamily: font.medium, fontSize: 11.5, color: INK_SOFT },
  flexBtn: {
    backgroundColor: ACCENT,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 16,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexBtnText: { color: '#fff', fontFamily: font.bold, fontSize: 12.5 },
});
