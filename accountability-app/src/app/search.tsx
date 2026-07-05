import { useCallback, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useIsPro } from '../pro/ProProvider';
import {
  clearSearchHistory,
  deleteSearchEntry,
  listSearchHistory,
  recordSearch,
  type SearchEntry,
} from '../search/history';
import { timeAgo } from '../feed/format';
import { searchBuddies, type Candidate } from '../buddy/api';
import { listGroups, type Group } from '../groups/api';
import { listPages, type Page } from '../pages/api';
import { Avatar } from '../feed/Avatar';
import { authorLabel } from '../feed/format';
import { EmptyState } from '../ui/EmptyState';
import { colors, font, radius, spacing, contentMax } from '../ui/theme';

export default function Search() {
  const router = useRouter();
  const { isPro } = useIsPro();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Candidate[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [history, setHistory] = useState<SearchEntry[]>([]);
  const seq = useRef(0);

  const loadHistory = useCallback(() => {
    listSearchHistory(isPro).then(setHistory).catch(() => {});
  }, [isPro]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory]),
  );

  // a committed search = keyboard submit or tapping a result
  function commit(q: string) {
    recordSearch(q).then(loadHistory).catch(() => {});
  }

  async function onChange(text: string) {
    setQuery(text);
    const q = text.trim().toLowerCase();
    if (q.length < 2) {
      setPeople([]);
      setGroups([]);
      setPages([]);
      setSearched(false);
      return;
    }
    const mySeq = ++seq.current;
    setSearching(true);
    try {
      const [p, g, pg] = await Promise.all([
        searchBuddies(q).catch(() => [] as Candidate[]),
        listGroups().catch(() => [] as Group[]),
        listPages().catch(() => [] as Page[]),
      ]);
      if (mySeq !== seq.current) return; // a newer keystroke won
      setPeople(p.slice(0, 8));
      setGroups(g.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 8));
      setPages(
        pg
          .filter(
            (x) => x.name.toLowerCase().includes(q) || x.handle.toLowerCase().includes(q),
          )
          .slice(0, 8),
      );
      setSearched(true);
    } finally {
      if (mySeq === seq.current) setSearching(false);
    }
  }

  const nothing = searched && !searching && !people.length && !groups.length && !pages.length;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={17} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search people, groups, pages…"
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={onChange}
            onSubmitEditing={() => query.trim().length >= 2 && commit(query)}
            returnKeyType="search"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </View>

        {/* recent searches — shown before typing */}
        {!searched && !searching && history.length > 0 ? (
          <>
            <View style={styles.historyHeader}>
              <Text style={styles.section}>Recent searches</Text>
              <Pressable
                onPress={() => {
                  clearSearchHistory()
                    .then(() => setHistory([]))
                    .catch(() => {});
                }}
                hitSlop={8}
                accessibilityLabel="Clear search history"
              >
                <Text style={styles.clearAll}>Clear all</Text>
              </Pressable>
            </View>
            {history.map((h) => (
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
                    deleteSearchEntry(h.id)
                      .then(() => setHistory((cur) => cur.filter((x) => x.id !== h.id)))
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

        {people.length > 0 ? <Text style={styles.section}>People</Text> : null}
        {people.map((p) => (
          <Row
            key={p.id}
            title={authorLabel(p.display_name)}
            sub={p.area ?? 'Accountability buddy'}
            left={<Avatar url={p.avatar_url} name={p.display_name} size={40} />}
            onPress={() => {
              commit(query);
              router.push({ pathname: '/buddy-card/[id]', params: { id: p.id } } as never);
            }}
          />
        ))}

        {groups.length > 0 ? <Text style={styles.section}>Groups</Text> : null}
        {groups.map((g) => (
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
              commit(query);
              router.push(`/group/${g.id}` as never);
            }}
          />
        ))}

        {pages.length > 0 ? <Text style={styles.section}>Pages</Text> : null}
        {pages.map((p) => (
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
              commit(query);
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
