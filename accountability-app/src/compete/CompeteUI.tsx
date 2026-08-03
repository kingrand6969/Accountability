import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../feed/Avatar';
import { font, radius, spacing } from '../ui/theme';
import { formatScore, type Metric } from './api';

export const INK = '#1e1b4b';
export const INK_SOFT = 'rgba(30,27,75,0.72)';
export const ACCENT = '#2563eb';
const GOLD = '#f59e0b';
const SILVER = '#94a3b8';
const BRONZE = '#b45309';

type Opt = { value: string; label: string; icon?: string };

/** Pill segmented control (Rankings / Challenges / Buddies, City / Country, …). */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: Opt[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={({ pressed }) => [styles.segBtn, active && styles.segActive, pressed && styles.pressed]}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {o.icon ? (
              <Ionicons name={o.icon as never} size={14} color={active ? '#fff' : INK_SOFT} />
            ) : null}
            <Text style={[styles.segText, active && styles.segTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontal selectable chips (metric / period). */
export function Chips({
  options,
  value,
  onChange,
}: {
  options: Opt[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {o.icon ? (
              <Ionicons name={o.icon as never} size={13} color={active ? '#fff' : ACCENT} />
            ) : null}
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const MEDALS = [GOLD, SILVER, BRONZE];

/** A leaderboard / standings row: rank badge, avatar, name, score. */
export function RankRow({
  rank,
  name,
  avatar,
  score,
  metric,
  highlight,
  subtitle,
}: {
  rank: number;
  name: string | null;
  avatar: string | null;
  score: number;
  metric: Metric;
  highlight?: boolean;
  subtitle?: string | null;
}) {
  const medal = rank <= 3 ? MEDALS[rank - 1] : null;
  return (
    <View style={[styles.row, highlight && styles.rowMe]}>
      <View style={[styles.rankBadge, medal ? { backgroundColor: medal } : null]}>
        <Text style={[styles.rankNum, medal ? { color: '#fff' } : null]}>{rank}</Text>
      </View>
      <Avatar url={avatar} name={name} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {name?.trim() || 'Member'}
          {highlight ? ' (you)' : ''}
        </Text>
        {subtitle ? (
          <Text style={styles.sub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Text style={styles.score}>{formatScore(score, metric)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  seg: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.pill,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: radius.pill,
    minHeight: 38,
  },
  segActive: { backgroundColor: ACCENT },
  segText: { fontFamily: font.bold, fontSize: 13.5, color: INK_SOFT },
  segTextActive: { color: '#fff' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 13,
    minHeight: 34,
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: INK },
  chipTextActive: { color: '#fff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  rowMe: {
    backgroundColor: 'rgba(37,99,235,0.10)',
    borderRadius: radius.md,
    paddingHorizontal: 8,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(30,27,75,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: { fontFamily: font.extrabold, fontSize: 13, color: INK_SOFT },
  name: { fontFamily: font.bold, fontSize: 14.5, color: INK },
  sub: { fontFamily: font.medium, fontSize: 12, color: INK_SOFT, marginTop: 1 },
  score: { fontFamily: font.extrabold, fontSize: 15, color: ACCENT },
});
