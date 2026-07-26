import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useIsPro } from '../pro/ProProvider';
import { GlassBackdrop, GlassCard } from '../ui/Glass';
import { contentMaxWidth } from '../ui/responsive';
import { font, radius, spacing } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { Chips, RankRow, Segmented, INK, INK_SOFT, ACCENT } from '../compete/CompeteUI';
import { getRank, flexStanding } from '../achievements/api';
import { RankBadge } from '../achievements/RankBadge';
import { hapticSuccess } from '../ui/haptics';
import {
  METRICS,
  PERIODS,
  enableLocationSharing,
  getBuddyStandings,
  getLeaderboard,
  getLocationSharing,
  listChallenges,
  joinChallenge,
  leaveChallenge,
  metricMeta,
  formatScore,
  syncTimezone,
  type ChallengeCard,
  type LocationSharing,
  type Metric,
  type Period,
  type Scope,
} from '../compete/api';
import { MissionIcon } from '../achievements/MissionIcon';
import { challengeArtFor } from '../achievements/missionArt';

const metricOpts = METRICS.map((m) => ({ value: m.value, label: m.label, icon: m.icon }));
const periodOpts = PERIODS.map((p) => ({ value: p.value, label: p.label }));

function daysLeft(ends: string): string {
  const ms = new Date(ends).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const d = Math.ceil(ms / 86400000);
  return d === 1 ? '1 day left' : `${d} days left`;
}

export default function Compete() {
  const router = useRouter();
  const { isPro } = useIsPro();
  const { width } = useWindowDimensions();
  const colMax = contentMaxWidth(width);
  const bgRef = useRef<View>(null);
  const [tab, setTab] = useState<'rankings' | 'challenges' | 'buddies'>('rankings');
  const [uid, setUid] = useState<string | null>(null);
  const [rank, setRank] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then((r) => setUid(r.data.user?.id ?? null));
    // keep the user's local-day offset current so board days match their streak
    syncTimezone();
  }, []);

  useFocusEffect(
    useCallback(() => {
      getRank()
        .then((r) => setRank(r.name))
        .catch(() => {});
    }, []),
  );

  return (
    <View style={styles.screen}>
      <GlassBackdrop ref={bgRef} columnWidth={colMax} />
      <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: colMax }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Compete</Text>
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => router.push('/win-card' as never)}
              hitSlop={8}
              style={({ pressed }) => [styles.winBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Share a win"
            >
              <Ionicons name="flame" size={17} color="#f59e0b" />
            </Pressable>
            {rank ? <RankBadge rank={rank} size={30} onPress={() => router.push('/achievements' as never)} /> : null}
          </View>
        </View>
        <Segmented
          options={[
            { value: 'rankings', label: 'Rankings', icon: 'podium' },
            { value: 'challenges', label: 'Challenges', icon: 'trophy' },
            { value: 'buddies', label: 'Buddies', icon: 'people' },
          ]}
          value={tab}
          onChange={(v) => setTab(v as never)}
        />

        {tab === 'rankings' ? <RankingsTab uid={uid} /> : null}
        {tab === 'challenges' ? <ChallengesTab isPro={isPro} router={router} /> : null}
        {tab === 'buddies' ? <BuddiesTab uid={uid} router={router} /> : null}
      </ScrollView>
    </View>
  );
}

// ─── Rankings ────────────────────────────────────────────────────────────────

function RankingsTab({ uid }: { uid: string | null }) {
  const [sharing, setSharing] = useState<LocationSharing | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [scope, setScope] = useState<Scope>('city');
  const [metric, setMetric] = useState<Metric>('consistency');
  const [period, setPeriod] = useState<Period>('week');
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getLeaderboard>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [flexing, setFlexing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getLocationSharing().then(setSharing).catch(() => setSharing({ city: null, country: null, share_location: false }));
    }, []),
  );

  useEffect(() => {
    if (!sharing?.share_location) return;
    let live = true;
    setLoading(true);
    setLoadError(false);
    getLeaderboard(scope, metric, period)
      .then((r) => live && setRows(r))
      .catch(() => {
        if (live) {
          setRows([]);
          setLoadError(true);
        }
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [sharing?.share_location, scope, metric, period, reloadKey]);

  async function onEnable() {
    setEnabling(true);
    try {
      await enableLocationSharing();
      setSharing(await getLocationSharing());
    } catch (e) {
      Alert.alert('Could not enable location', String((e as Error).message ?? e));
    } finally {
      setEnabling(false);
    }
  }

  if (!sharing) {
    return <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />;
  }

  if (!sharing.share_location) {
    return (
      <GlassCard style={styles.card}>
        <View style={styles.pad}>
          <View style={styles.iconWrap}>
            <Ionicons name="location" size={26} color={ACCENT} />
          </View>
          <Text style={styles.cardTitle}>Join your local leaderboards</Text>
          <Text style={styles.cardSub}>
            Share your city &amp; country to see how you rank against people near you. Your precise
            location is never shown — only your city.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={onEnable}
            disabled={enabling}
            accessibilityRole="button"
          >
            {enabling ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Turn on location</Text>
            )}
          </Pressable>
        </View>
      </GlassCard>
    );
  }

  const placeLabel = sharing.city || sharing.country;
  const meRow = rows.find((r) => r.user_id === uid) ?? null;
  const boardLabel = (scope === 'city' ? sharing.city : sharing.country) || 'my area';

  async function onFlexStanding() {
    if (!meRow || flexing) return;
    setFlexing(true);
    try {
      await flexStanding(
        meRow.rnk,
        boardLabel,
        metricMeta(metric).label,
        formatScore(meRow.score, metric),
      );
      hapticSuccess();
      showToast('Flexed to your feed 🏆');
    } catch (e) {
      Alert.alert('Could not post your flex', String((e as Error).message ?? e));
    } finally {
      setFlexing(false);
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      <Segmented
        options={[
          { value: 'city', label: sharing.city || 'City' },
          { value: 'country', label: sharing.country || 'Country' },
        ]}
        value={scope}
        onChange={(v) => setScope(v as Scope)}
      />
      <Chips options={metricOpts} value={metric} onChange={(v) => setMetric(v as Metric)} />
      {metric === 'avgkm' ? (
        <Text style={styles.note}>Lifetime pace — total km averaged since each member joined.</Text>
      ) : (
        <Chips options={periodOpts} value={period} onChange={(v) => setPeriod(v as Period)} />
      )}

      {!placeLabel ? (
        <Text style={styles.note}>
          We couldn&apos;t read your city on this device. Open the app on your phone with location on
          to appear on the board.
        </Text>
      ) : null}

      <GlassCard style={styles.card}>
        <View style={styles.listPad}>
          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ marginVertical: 24 }} />
          ) : loadError ? (
            <RetryState label="leaderboard" onRetry={() => setReloadKey((value) => value + 1)} />
          ) : rows.length === 0 ? (
            <Text style={styles.empty}>No scores yet — log something to get on the board.</Text>
          ) : (
            rows.map((r) => (
              <RankRow
                key={r.user_id}
                rank={r.rnk}
                name={r.display_name}
                avatar={r.avatar_url}
                score={r.score}
                metric={metric}
                highlight={r.user_id === uid}
                subtitle={scope === 'country' ? r.city : null}
              />
            ))
          )}
        </View>
      </GlassCard>

      {meRow ? (
        <Pressable
          style={({ pressed }) => [styles.flexBtn, pressed && styles.pressed]}
          onPress={onFlexStanding}
          disabled={flexing}
          accessibilityRole="button"
          accessibilityLabel="Flex your leaderboard spot to your feed"
        >
          {flexing ? (
            <ActivityIndicator size="small" color={ACCENT} />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color={ACCENT} />
              <Text style={styles.flexBtnText}>
                Flex my spot — #{meRow.rnk} in {boardLabel}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Challenges ──────────────────────────────────────────────────────────────

function ChallengesTab({ isPro, router }: { isPro: boolean; router: ReturnType<typeof useRouter> }) {
  const [items, setItems] = useState<ChallengeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    listChallenges()
      .then(setItems)
      .catch(() => {
        setItems([]);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  async function toggle(c: ChallengeCard) {
    setBusy(c.id);
    try {
      if (c.joined) await leaveChallenge(c.id);
      else await joinChallenge(c.id);
      showToast(c.joined ? 'Left the challenge' : 'Joined — go compete! 🏆');
      load();
    } catch (e) {
      Alert.alert('Could not update', String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        onPress={() => (isPro ? router.push('/challenge-new') : router.push('/paywall'))}
        accessibilityRole="button"
        accessibilityLabel={isPro ? 'Create a challenge' : 'Learn about Pro challenge creation'}
      >
        <Ionicons name={isPro ? 'add' : 'lock-closed'} size={17} color="#fff" />
        <Text style={styles.primaryBtnText}>
          {isPro ? 'Create a challenge' : 'Create a challenge — Pro'}
        </Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 30 }} />
      ) : loadError ? (
        <GlassCard style={styles.card}>
          <View style={styles.pad}>
            <Ionicons name="cloud-offline-outline" size={28} color={INK_SOFT} />
            <Text style={styles.cardTitle}>Challenges couldn&apos;t load</Text>
            <Text style={styles.cardSub}>Check your connection, then try again.</Text>
            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              onPress={load}
              accessibilityRole="button"
              accessibilityLabel="Retry loading challenges"
            >
              <Text style={styles.secondaryBtnText}>Try again</Text>
            </Pressable>
          </View>
        </GlassCard>
      ) : items.length === 0 ? (
        <GlassCard style={styles.card}>
          <View style={styles.pad}>
            <Text style={styles.empty}>No challenges yet. {isPro ? 'Start one!' : 'Go Pro to start one.'}</Text>
          </View>
        </GlassCard>
      ) : (
        items.map((c) => {
          const meta = metricMeta(c.metric);
          const ended = new Date(c.ends_at).getTime() <= Date.now();
          return (
            <GlassCard key={c.id} style={styles.card}>
              <Pressable
                style={({ pressed }) => [styles.challengePad, pressed && styles.pressed]}
                onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: c.id } })}
                accessibilityRole="button"
                accessibilityLabel={`Open ${c.title}`}
              >
                {(() => {
                  const art = challengeArtFor(c.metric);
                  return art ? (
                    <MissionIcon source={art} size={48} />
                  ) : (
                    <View style={[styles.iconWrap, { marginBottom: 0 }]}>
                      <Ionicons name={meta.icon as never} size={22} color={ACCENT} />
                    </View>
                  );
                })()}
                <View style={{ flex: 1 }}>
                  {c.is_official ? (
                    <Text style={styles.officialLabel}>
                      OFFICIAL · {(c.difficulty ?? 'beginner').toUpperCase()}
                    </Text>
                  ) : null}
                  <Text style={styles.challengeTitle} numberOfLines={1}>
                    {c.title}
                  </Text>
                  <Text style={styles.challengeMeta}>
                    {meta.label} · {c.participants} in · {daysLeft(c.ends_at)}
                  </Text>
                  {c.target ? (
                    <Text style={styles.challengeGoal}>
                      Goal: {formatScore(c.target, c.metric)}
                      {c.rest_day_tokens ? ` · ${c.rest_day_tokens} rest-day tokens` : ''}
                    </Text>
                  ) : null}
                </View>
                {ended ? (
                  <View style={[styles.joinBtn, styles.joinedBtn]}>
                    <Text style={styles.joinedText}>Results</Text>
                  </View>
                ) : (
                  <Pressable
                    style={({ pressed }) => [
                      styles.joinBtn,
                      c.joined && styles.joinedBtn,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => toggle(c)}
                    disabled={busy === c.id}
                    accessibilityRole="button"
                    accessibilityLabel={c.joined ? `Leave ${c.title}` : `Join ${c.title}`}
                    accessibilityState={{ disabled: busy === c.id, busy: busy === c.id }}
                  >
                    {busy === c.id ? (
                      <ActivityIndicator size="small" color={c.joined ? INK_SOFT : '#fff'} />
                    ) : (
                      <Text style={c.joined ? styles.joinedText : styles.joinText}>
                        {c.joined ? 'Joined' : 'Join'}
                      </Text>
                    )}
                  </Pressable>
                )}
              </Pressable>
            </GlassCard>
          );
        })
      )}
    </View>
  );
}

// ─── Buddies ─────────────────────────────────────────────────────────────────

function BuddiesTab({ uid, router }: { uid: string | null; router: ReturnType<typeof useRouter> }) {
  const [metric, setMetric] = useState<Metric>('consistency');
  const [period, setPeriod] = useState<Period>('week');
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getBuddyStandings>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError(false);
    getBuddyStandings(metric, period)
      .then((r) => live && setRows(r))
      .catch(() => {
        if (live) {
          setRows([]);
          setLoadError(true);
        }
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [metric, period, reloadKey]);

  const soloOrEmpty = !loading && rows.filter((r) => !r.is_me).length === 0;

  return (
    <View style={{ gap: spacing.md }}>
      <Pressable
        style={({ pressed }) => [styles.mapBtn, pressed && styles.pressed]}
        onPress={() => router.push('/buddy-map')}
        accessibilityRole="button"
      >
        <Ionicons name="map" size={18} color={ACCENT} />
        <Text style={styles.mapBtnText}>Share &amp; see live location</Text>
        <Ionicons name="chevron-forward" size={16} color={INK_SOFT} />
      </Pressable>

      <Chips options={metricOpts} value={metric} onChange={(v) => setMetric(v as Metric)} />
      {metric === 'avgkm' ? (
        <Text style={styles.note}>Lifetime pace — total km averaged since each member joined.</Text>
      ) : (
        <Chips options={periodOpts} value={period} onChange={(v) => setPeriod(v as Period)} />
      )}

      <GlassCard style={styles.card}>
        <View style={styles.listPad}>
          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ marginVertical: 24 }} />
          ) : loadError ? (
            <RetryState label="buddy standings" onRetry={() => setReloadKey((value) => value + 1)} />
          ) : soloOrEmpty ? (
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
              <Text style={styles.empty}>Add accountability buddies to compete head-to-head.</Text>
              <Pressable
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                onPress={() => router.push('/buddy')}
                accessibilityRole="button"
                accessibilityLabel="Find accountability buddies"
              >
                <Text style={styles.secondaryBtnText}>Find buddies</Text>
              </Pressable>
            </View>
          ) : (
            rows.map((r) => (
              <RankRow
                key={r.user_id}
                rank={r.rnk}
                name={r.display_name}
                avatar={r.avatar_url}
                score={r.score}
                metric={metric}
                highlight={r.is_me}
              />
            ))
          )}
        </View>
      </GlassCard>
    </View>
  );
}

function RetryState({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
      <Ionicons name="cloud-offline-outline" size={26} color={INK_SOFT} />
      <Text style={styles.empty}>Couldn&apos;t load the {label}.</Text>
      <Pressable
        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={`Retry loading ${label}`}
      >
        <Text style={styles.secondaryBtnText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  winBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 26, fontFamily: font.extrabold, color: INK },
  pressed: { opacity: 0.7 },
  card: {},
  pad: { padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  listPad: { padding: spacing.sm, gap: 2 },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(37,99,235,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  cardTitle: { fontFamily: font.bold, fontSize: 17, color: INK, textAlign: 'center' },
  cardSub: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: INK_SOFT,
    textAlign: 'center',
    lineHeight: 19,
  },
  note: { fontFamily: font.medium, fontSize: 12.5, color: INK_SOFT, lineHeight: 18, paddingHorizontal: 4 },
  empty: { fontFamily: font.medium, fontSize: 13.5, color: INK_SOFT, textAlign: 'center', paddingVertical: 12 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: radius.pill,
    paddingVertical: 13,
    paddingHorizontal: 20,
    minHeight: 48,
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
  secondaryBtn: {
    backgroundColor: 'rgba(37,99,235,0.12)',
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  secondaryBtnText: { color: ACCENT, fontFamily: font.bold, fontSize: 13.5 },
  challengePad: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  challengeTitle: { fontFamily: font.bold, fontSize: 15.5, color: INK },
  officialLabel: { fontFamily: font.extrabold, fontSize: 9.5, color: ACCENT, letterSpacing: 0.6 },
  challengeMeta: { fontFamily: font.medium, fontSize: 12.5, color: INK_SOFT, marginTop: 2 },
  challengeGoal: { fontFamily: font.medium, fontSize: 11.5, color: INK_SOFT, marginTop: 2 },
  joinBtn: {
    backgroundColor: ACCENT,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinedBtn: { backgroundColor: 'rgba(30,27,75,0.08)' },
  joinText: { color: '#fff', fontFamily: font.bold, fontSize: 13 },
  joinedText: { color: INK_SOFT, fontFamily: font.bold, fontSize: 13 },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 48,
  },
  mapBtnText: { flex: 1, fontFamily: font.bold, fontSize: 14, color: INK },
  flexBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(37,99,235,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.3)',
    borderRadius: radius.pill,
    paddingVertical: 12,
    minHeight: 44,
  },
  flexBtnText: { fontFamily: font.bold, fontSize: 14, color: ACCENT },
});
