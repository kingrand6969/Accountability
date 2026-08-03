import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsPro } from '../pro/ProProvider';
import {
  clearSearchHistory,
  deleteSearchEntry,
  listSearchHistory,
  recordSearch,
  type SearchEntry,
} from '../search/history';
import { authorLabel, timeAgo } from '../feed/format';
import { searchBuddies, type Candidate } from '../buddy/api';
import { listGroups, type Group } from '../groups/api';
import { listPages, type Page } from '../pages/api';
import { Avatar } from '../feed/Avatar';
import { EmptyState } from '../ui/EmptyState';
import { colors, font, radius, spacing, contentMax } from '../ui/theme';
import { useAuth } from '../auth/AuthProvider';

export default function Search() {
  const router = useRouter();
  const { isPro } = useIsPro();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const currentOwnerRef = useRef(ownerId);
  const lifecycleGeneration = useRef(0);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Candidate[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [history, setHistory] = useState<SearchEntry[]>([]);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(ownerId);
  const seq = useRef(0);

  useEffect(() => {
    const lifecycle = ++lifecycleGeneration.current;
    currentOwnerRef.current = ownerId;
    seq.current += 1;
    queueMicrotask(() => {
      if (
        lifecycle !== lifecycleGeneration.current ||
        currentOwnerRef.current !== ownerId
      )
        return;
      setQuery('');
      setPeople([]);
      setGroups([]);
      setPages([]);
      setSearching(false);
      setSearched(false);
      setHistory([]);
      setDataOwnerId(ownerId);
    });
  }, [ownerId]);

  const loadHistory = useCallback(async () => {
    const requestOwner = ownerId;
    const lifecycle = lifecycleGeneration.current;
    if (!requestOwner) return;
    try {
      const next = await listSearchHistory(isPro, requestOwner);
      if (lifecycle !== lifecycleGeneration.current || requestOwner !== currentOwnerRef.current)
        return;
      setHistory(next.slice(0, isPro ? 100 : 20));
      setDataOwnerId(requestOwner);
    } catch {
      // History is optional; search remains usable.
    }
  }, [isPro, ownerId]);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
      return () => {
        lifecycleGeneration.current += 1;
        seq.current += 1;
        setSearching(false);
      };
    }, [loadHistory]),
  );

  // a committed search = keyboard submit or tapping a result
  function commit(q: string) {
    const requestOwner = ownerId;
    const lifecycle = lifecycleGeneration.current;
    if (!requestOwner) return;
    recordSearch(q, requestOwner)
      .then(() => {
        if (lifecycle === lifecycleGeneration.current && requestOwner === currentOwnerRef.current) {
          void loadHistory();
        }
      })
      .catch(() => {});
  }

  async function onChange(text: string) {
    setDataOwnerId(ownerId);
    setQuery(text);
    const requestOwner = ownerId;
    const lifecycle = lifecycleGeneration.current;
    const q = text.trim().toLowerCase();
    if (q.length < 2) {
      setPeople([]);
      setGroups([]);
      setPages([]);
      setSearched(false);
      return;
    }
    if (!requestOwner) return;
    const mySeq = ++seq.current;
    setSearching(true);
    try {
      const [p, g, pg] = await Promise.all([
        searchBuddies(q).catch(() => [] as Candidate[]),
        listGroups().catch(() => [] as Group[]),
        listPages().catch(() => [] as Page[]),
      ]);
      if (
        mySeq !== seq.current ||
        lifecycle !== lifecycleGeneration.current ||
        requestOwner !== currentOwnerRef.current
      )
        return;
      setPeople(p.slice(0, 8));
      setGroups(
        g
          .filter((x) => x.privacy === 'public' && x.name.toLowerCase().includes(q))
          .slice(0, 8),
      );
      setPages(
        pg
          .filter(
            (x) =>
              x.privacy === 'public' &&
              (x.name.toLowerCase().includes(q) || x.handle.toLowerCase().includes(q)),
          )
          .slice(0, 8),
      );
      setSearched(true);
      setDataOwnerId(requestOwner);
    } finally {
      if (
        mySeq === seq.current &&
        lifecycle === lifecycleGeneration.current &&
        requestOwner === currentOwnerRef.current
      )
        setSearching(false);
    }
  }

  const ownsData = dataOwnerId === ownerId;
  const visibleQuery = ownsData ? query : '';
  const visiblePeople = ownsData ? people : [];
  const visibleGroups = ownsData ? groups : [];
  const visiblePages = ownsData ? pages : [];
  const visibleHistory = ownsData ? history : [];
  const nothing =
    ownsData &&
    searched &&
    !searching &&
    !visiblePeople.length &&
    !visibleGroups.length &&
    !visiblePages.length;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={17} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search people, groups, pages…"
            placeholderTextColor={colors.textFaint}
            value={visibleQuery}
            onChangeText={onChange}
            onSubmitEditing={() => visibleQuery.trim().length >= 2 && commit(visibleQuery)}
            returnKeyType="search"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </View>

        {/* recent searches — shown before typing */}
        {!searched && !searching && visibleHistory.length > 0 ? (
          <>
            <View style={styles.historyHeader}>
              <Text style={styles.section}>Recent searches</Text>
              <Pressable
                onPress={() => {
                  const requestOwner = ownerId;
                  const lifecycle = lifecycleGeneration.current;
                  if (!requestOwner) return;
                  clearSearchHistory(requestOwner)
                    .then(() => {
                      if (
                        lifecycle === lifecycleGeneration.current &&
                        requestOwner === currentOwnerRef.current
                      )
                        setHistory([]);
                    })
                    .catch(() => {});
                }}
                hitSlop={8}
                accessibilityLabel="Clear search history"
              >
                <Text style={styles.clearAll}>Clear all</Text>
              </Pressable>
            </View>
            {visibleHistory.map((h) => (
              <Pressable
                key={h.id}
                style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}
                onPress={() => onChange(h.query)}
                accessibilityLabel={`Search again for ${h.query}`}
              >
                <Ionicons name="time-outline" size={16} color={colors.textFaint} />
                <Text style={styles.historyQuery} numberOfLines={1}>
                  {h.query}
                </Text>
                <Text style={styles.historyTime}>{timeAgo(h.created_at)}</Text>
                <Pressable
                  onPress={() => {
                    const requestOwner = ownerId;
                    const lifecycle = lifecycleGeneration.current;
                    if (!requestOwner) return;
                    deleteSearchEntry(h.id, requestOwner)
                      .then(() => {
                        if (
                          lifecycle === lifecycleGeneration.current &&
                          requestOwner === currentOwnerRef.current
                        )
                          setHistory((cur) => cur.filter((x) => x.id !== h.id));
                      })
                      .catch(() => {});
                  }}
                  hitSlop={10}
                  accessibilityLabel={`Remove ${h.query} from history`}
                >
                  <Ionicons name="close" size={16} color={colors.textFaint} />
                </Pressable>
              </Pressable>
            ))}
            {!isPro ? (
              <Text style={styles.historyNote}>
                Free keeps 30 days of history — Pro keeps it forever.
              </Text>
            ) : null}
          </>
        ) : null}

        {visiblePeople.length > 0 ? <Text style={styles.section}>People</Text> : null}
        {visiblePeople.map((p) => (
          <Row
            key={p.id}
            title={authorLabel(p.display_name)}
            sub={p.area ?? 'Accountability buddy'}
            left={<Avatar url={p.avatar_url} name={p.display_name} size={40} />}
            onPress={() => {
              commit(visibleQuery);
              router.push({ pathname: '/buddy-card/[id]', params: { id: p.id } } as never);
            }}
          />
        ))}

        {visibleGroups.length > 0 ? <Text style={styles.section}>Groups</Text> : null}
        {visibleGroups.map((g) => (
          <Row
            key={g.id}
            title={g.name}
            sub={`${g.member_count} members`}
            left={
              <View style={styles.iconCircle}>
                <Ionicons name="people" size={18} color={colors.primary} />
              </View>
            }
            onPress={() => {
              commit(visibleQuery);
              router.push(`/group/${g.id}` as never);
            }}
          />
        ))}

        {visiblePages.length > 0 ? <Text style={styles.section}>Pages</Text> : null}
        {visiblePages.map((p) => (
          <Row
            key={p.id}
            title={p.name}
            sub={`@${p.handle} · ${p.follower_count} followers`}
            left={
              p.avatar_url ? (
                <Image source={{ uri: p.avatar_url }} style={styles.pageAvatar} />
              ) : (
                <View style={styles.iconCircle}>
                  <Ionicons name="storefront-outline" size={17} color={colors.primary} />
                </View>
              )
            }
            onPress={() => {
              commit(visibleQuery);
              router.push(`/page/${p.id}` as never);
            }}
          />
        ))}

        {nothing ? (
          <EmptyState
            icon="search-outline"
            title="No results"
            subtitle="Try a different name — or invite them to AccountAbility."
          />
        ) : null}
        {!searched && !searching ? (
          <Text style={styles.hint}>Find buddies, groups and business pages.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({
  title,
  sub,
  left,
  onPress,
}: {
  title: string;
  sub: string;
  left: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityLabel={title}
    >
      {left}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 40, ...contentMax },
  pressed: { opacity: 0.75 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    paddingVertical: 12,
  },
  section: {
    fontSize: 13,
    fontFamily: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 60,
  },
  rowTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  rowSub: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface },
  hint: {
    textAlign: 'center',
    color: colors.textFaint,
    fontFamily: font.regular,
    fontSize: 13,
    marginTop: spacing.xl,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clearAll: { color: colors.primary, fontFamily: font.semibold, fontSize: 13, marginTop: spacing.md },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    minHeight: 44,
  },
  historyQuery: { flex: 1, fontFamily: font.medium, fontSize: 14.5, color: colors.text },
  historyTime: { fontFamily: font.regular, fontSize: 12, color: colors.textFaint },
  historyNote: {
    fontFamily: font.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
