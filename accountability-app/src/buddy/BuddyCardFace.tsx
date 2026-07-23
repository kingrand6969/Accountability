import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CARD_BLUE,
  type BoardRank,
  type BuddyCard,
  type BuddyStats,
  type CardMetrics,
} from './card';
import { RankBadge } from '../achievements/RankBadge';
import { Medal } from '../achievements/Medal';
import { MEDALS, medalState, type MedalState } from '../achievements/catalog';
import { authorLabel, timeAgo } from '../feed/format';
import { font, radius } from '../ui/theme';

/** Rebuild displayable medal states from a card's snapshot (id + tier). */
export function medalsFromCard(card: BuddyCard): MedalState[] {
  return (card.medals_list ?? [])
    .map((m) => {
      const def = MEDALS.find((d) => d.id === m.id);
      if (!def) return null;
      const i = Math.min(Math.max(m.tier, 0), def.tiers.length - 1);
      return medalState(def, def.tiers[i].at);
    })
    .filter((s): s is MedalState => s !== null);
}

/**
 * The buddy card — a blue card with white content, in two responsive shapes:
 *
 *  • WIDE (tablets / large screens): the owner's reference layout — avatar +
 *    identity on the left, and Member Since / Achievements / the five metrics /
 *    Focus / Medals stacked in a right column.
 *
 *  • NARROW (phones): the same pieces re-flowed for a slim screen — avatar and
 *    Member Since / Achievements on top, identity beside Focus & Medals, and the
 *    five metrics on ONE full-width row along the bottom (where they finally fit
 *    without overlapping).
 */
export function BuddyCardFace({
  name,
  area,
  avatar,
  memberSince,
  lastActive,
  headline,
  card,
  stats,
  boardRank,
  metrics,
  onPressMedals,
}: {
  name: string | null;
  area: string | null;
  avatar: string | null;
  memberSince: string;
  lastActive?: string | null;
  headline: string | null;
  card: BuddyCard;
  stats: BuddyStats | null;
  boardRank: BoardRank | null;
  metrics?: CardMetrics | null;
  onPressMedals?: () => void;
}) {
  const { width: winW } = useWindowDimensions();
  const [availW, setAvailW] = useState(0);
  const w = availW || winW; // the card's own width once measured
  const wide = w >= 500;
  const avatarSize = wide ? 200 : 150;
  const medalCap = wide ? 8 : 4; // narrow screens show fewer coins, then "+N"
  // Everyone holds at least the base "Rookie" rank, so the badge always shows.
  const rankName = card.rank_name || 'Rookie';

  // ranks show automatically when the member shares location (they're already
  // public on the leaderboards); '—' otherwise.
  const countryRank = boardRank?.countryRank ? `#${boardRank.countryRank}` : '—';
  const cityRank = boardRank?.cityRank ? `#${boardRank.cityRank}` : '—';
  const buddiesRank =
    metrics?.buddiesRank && metrics.buddiesTotal > 1 ? `#${metrics.buddiesRank}` : '—';

  const lastSeen = lastActive ? `Active ${timeAgo(lastActive)}` : null;

  const tiles = metrics
    ? [
        { value: String(Math.round(metrics.consistency)), label: 'Consistency' },
        { value: String(Math.round(metrics.points)), label: 'Points' },
        { value: metrics.avgkm.toFixed(2), label: 'Avg km/d' },
        { value: metrics.distance.toFixed(1), label: 'Distance' },
        { value: String(Math.round(metrics.chwin)), label: 'Wins' },
      ]
    : [];

  // ── shared pieces ───────────────────────────────────────────────
  const AvatarEl = (
    <View
      style={[
        styles.avatarRing,
        { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
      ]}
    >
      {avatar ? (
        <Image
          source={{ uri: avatar }}
          style={{ width: avatarSize - 6, height: avatarSize - 6, borderRadius: avatarSize / 2 }}
        />
      ) : (
        <Ionicons name="person" size={avatarSize * 0.5} color="rgba(37,99,235,0.85)" />
      )}
    </View>
  );

  const MemberSinceEl = (
    <View>
      <Text style={styles.rTitle}>Member Since</Text>
      <Text style={styles.rSub}>{memberSince}</Text>
    </View>
  );

  const AchievementsEl = (
    <View>
      <Text style={styles.rTitle}>Achievements</Text>
      <View style={styles.rankList}>
        <RankLine label="Country Rank" value={countryRank} />
        <RankLine label="City Rank" value={cityRank} />
        <RankLine label="Buddies Rank" value={buddiesRank} />
      </View>
    </View>
  );

  const identityInner = (
    <>
      <View style={styles.nameWrap}>
        <Text style={styles.name} numberOfLines={2}>
          {authorLabel(name)}
        </Text>
        <Text style={styles.idSub} numberOfLines={1}>
          {[area, lastSeen].filter(Boolean).join('  ·  ') || 'Accountability buddy'}
        </Text>
      </View>
      <RankBadge rank={rankName} size={wide ? 58 : 50} />
      <View style={styles.idStats}>
        <Text style={styles.idStat}>
          {stats?.cheers ?? 0} {(stats?.cheers ?? 0) === 1 ? 'Cheer' : 'Cheers'}
        </Text>
        <Text style={styles.idDot}>·</Text>
        <Text style={styles.idStat}>{stats?.buddies ?? 0} Buddies</Text>
        <Text style={styles.idDot}>·</Text>
        <Text style={styles.idStat}>{stats?.km ?? 0} km</Text>
      </View>
    </>
  );
  // Plain identity on the blue — centred, spread to fill the column height beside
  // Focus & Medals. (Wide is the approved reference layout; narrow matches it.)
  const IdentityEl = (
    <View style={[styles.idBlock, !wide && styles.idBlockNarrow]}>{identityInner}</View>
  );

  const FocusEl = (
    <View style={styles.box}>
      <Text style={styles.boxTitle}>Focus</Text>
      <Text style={headline ? styles.boxText : styles.boxMuted} numberOfLines={3}>
        {headline || 'Not set yet'}
      </Text>
    </View>
  );

  const medals = medalsFromCard(card);
  const canOpenMedals = medals.length > 0 && !!onPressMedals;
  const MedalsEl = (
    <Pressable
      style={({ pressed }) => [styles.box, canOpenMedals && pressed && styles.pressed]}
      onPress={canOpenMedals ? onPressMedals : undefined}
      disabled={!canOpenMedals}
      accessibilityRole={canOpenMedals ? 'button' : undefined}
      accessibilityLabel={canOpenMedals ? 'View all medals' : undefined}
    >
      <View style={styles.boxHeader}>
        <Text style={styles.boxTitle}>Medals</Text>
        {canOpenMedals ? <Ionicons name="chevron-forward" size={15} color={DIM} /> : null}
      </View>
      {medals.length ? (
        <View style={styles.medalShelf}>
          {medals.slice(0, medalCap).map((s, i) => (
            <Medal key={`${s.def.id}-${i}`} state={s} size={30} animate={false} />
          ))}
          {medals.length > medalCap ? (
            <View style={styles.medalMore}>
              <Text style={styles.medalMoreText}>+{medals.length - medalCap}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.boxMuted}>None yet</Text>
      )}
    </Pressable>
  );

  const MetricsEl = tiles.length ? (
    <View style={styles.metricRow}>
      {tiles.map((t) => (
        <View key={t.label} style={styles.metric}>
          <Text style={styles.mLabel}>{t.label}</Text>
          <Text style={styles.mNum}>{t.value}</Text>
        </View>
      ))}
    </View>
  ) : null;

  return (
    <View style={styles.frame} onLayout={(e) => setAvailW(Math.round(e.nativeEvent.layout.width))}>
      {/* brand-blue background */}
      <LinearGradient
        colors={CARD_BLUE}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {wide ? (
        // ── WIDE: two columns (tablets / large screens) ──
        <View style={styles.contentWide}>
          <View style={styles.leftWide}>
            {AvatarEl}
            {IdentityEl}
          </View>
          <View style={styles.rightWide}>
            {MemberSinceEl}
            {AchievementsEl}
            {MetricsEl}
            {FocusEl}
            {MedalsEl}
          </View>
        </View>
      ) : (
        // ── NARROW: stacked (phones) ──
        <View style={styles.contentNarrow}>
          <View style={styles.topRow}>
            {AvatarEl}
            <View style={styles.topRight}>
              {MemberSinceEl}
              {AchievementsEl}
            </View>
          </View>
          <View style={styles.midRow}>
            <View style={styles.midColLeft}>{IdentityEl}</View>
            <View style={styles.midColRight}>
              {FocusEl}
              {MedalsEl}
            </View>
          </View>
          {MetricsEl}
        </View>
      )}
    </View>
  );
}

function RankLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rankLine}>
      <Text style={styles.rankLabel}>{label}</Text>
      <Text style={styles.rankValue}>{value}</Text>
    </View>
  );
}

const WHITE = '#ffffff';
const DIM = 'rgba(255,255,255,0.82)';
const FAINT = 'rgba(255,255,255,0.55)';
const shadow = {
  textShadowColor: 'rgba(15,23,42,0.35)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
};

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  frame: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#1d4ed8' },

  // wide layout
  contentWide: { flexDirection: 'row', padding: 20, gap: 20 },
  leftWide: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 16 },
  rightWide: { flex: 1.15, minWidth: 0, gap: 14 },

  // narrow layout
  contentNarrow: { padding: 16, gap: 14 },
  topRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  topRight: { flex: 1, minWidth: 0, gap: 12, justifyContent: 'center' },
  midRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  midColLeft: { flex: 1, minWidth: 0 },
  midColRight: { flex: 1, minWidth: 0, gap: 10, justifyContent: 'space-between' },

  // avatar
  avatarRing: {
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // identity
  idBlock: { alignItems: 'center', gap: 10, width: '100%' },
  // narrow: plain, spread to fill the column height beside Focus/Medals
  idBlockNarrow: { flex: 1, width: '100%', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  nameWrap: { alignItems: 'center', gap: 2 },
  name: { fontFamily: font.extrabold, fontSize: 22, color: WHITE, textAlign: 'center', ...shadow },
  idSub: { fontFamily: font.medium, fontSize: 12.5, color: DIM, textAlign: 'center', ...shadow },
  idStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  idStat: { fontFamily: font.bold, fontSize: 13, color: WHITE, ...shadow },
  idDot: { fontFamily: font.bold, fontSize: 13, color: FAINT },

  // member since / achievements
  rTitle: { fontFamily: font.extrabold, fontSize: 16, color: WHITE, ...shadow },
  rSub: { fontFamily: font.medium, fontSize: 12.5, color: DIM, marginTop: 1 },
  rankList: { marginTop: 6, gap: 5, paddingLeft: 4 },
  rankLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rankLabel: { fontFamily: font.medium, fontSize: 13.5, color: DIM },
  rankValue: { fontFamily: font.extrabold, fontSize: 14.5, color: WHITE },

  // metrics — one row of five, sharing the width evenly
  metricRow: { flexDirection: 'row', columnGap: 6 },
  metric: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  mLabel: { fontFamily: font.semibold, fontSize: 10.5, color: DIM, textAlign: 'center' },
  mNum: { fontFamily: font.extrabold, fontSize: 18, color: WHITE, ...shadow },

  // focus / medals boxes
  box: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    padding: 13,
    minHeight: 60,
    gap: 3,
  },
  boxHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boxTitle: { fontFamily: font.bold, fontSize: 14, color: WHITE },
  boxText: { fontFamily: font.medium, fontSize: 13, color: DIM, lineHeight: 18 },
  boxMuted: { fontFamily: font.regular, fontSize: 13, color: FAINT },
  medalShelf: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
  medalMore: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  medalMoreText: { fontFamily: font.extrabold, fontSize: 12, color: WHITE },
});
