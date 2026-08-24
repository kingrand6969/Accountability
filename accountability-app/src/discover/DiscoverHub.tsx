import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { joinGroup, listGroups, type Group } from '../groups/api';
import { followPage, listPages, type Page } from '../pages/api';
import { showToast } from '../ui/Toast';
import {
  colors,
  font,
  radius,
  shadow,
  spacing,
  type AppThemeColors,
  type AppThemeMode,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import { DiscoverExperience } from './DiscoverExperience';
import {
  createDiscoverActionLock,
  discoverActionKey,
  isDiscoverActionBusy,
} from './discoverViewState';

type Section = 'people' | 'groups' | 'pages' | 'interests';
const SECTIONS: readonly { value: Section; label: string }[] = [
  { value: 'people', label: 'People' },
  { value: 'groups', label: 'Groups' },
  { value: 'pages', label: 'Pages' },
  { value: 'interests', label: 'Interests' },
];

export function DiscoverHub() {
  const { styles } = useDiscoverHubAppearance();
  const [section, setSection] = useState<Section>('people');
  return (
    <View style={styles.screen}>
      <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel="Discover sections">
        {SECTIONS.map((item) => (
          <Pressable
            key={item.value}
            style={[styles.tab, section === item.value && styles.tabActive]}
            onPress={() => setSection(item.value)}
            hitSlop={spacing.xs}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === item.value }}
          >
            <Text style={[styles.tabText, section === item.value && styles.tabTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {section === 'people' ? <DiscoverExperience scope="people" /> : null}
      {section === 'groups' ? <CommunityResults kind="groups" /> : null}
      {section === 'pages' ? <CommunityResults kind="pages" /> : null}
      {section === 'interests' ? <InterestResults /> : null}
    </View>
  );
}

function CommunityResults({ kind }: { kind: 'groups' | 'pages' }) {
  const { palette, styles } = useDiscoverHubAppearance();
  const router = useRouter();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const currentOwnerRef = useRef(ownerId);
  const generationRef = useRef(0);
  const [rows, setRows] = useState<(Group | Page)[]>([]);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const actionLockRef = useRef(createDiscoverActionLock());

  useLayoutEffect(() => {
    currentOwnerRef.current = ownerId;
    generationRef.current += 1;
    /* Privacy boundary: previous-account discovery rows must disappear before paint. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows([]);
    setDataOwnerId(null);
    setError(null);
    actionLockRef.current.clear();
    setBusy(new Set());
    setLoading(Boolean(ownerId));
  }, [ownerId, kind]);

  const load = useCallback(async () => {
    const requestOwner = ownerId;
    const generation = ++generationRef.current;
    if (!requestOwner) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = kind === 'groups' ? await listGroups() : await listPages();
      if (generation !== generationRef.current || requestOwner !== currentOwnerRef.current) return;
      const publicRows = result.filter((row) => row.privacy === 'public');
      setRows(
        kind === 'groups'
          ? (publicRows as Group[]).filter((row) => !row.is_member)
          : (publicRows as Page[]).filter((row) => !row.is_following && !row.is_owner),
      );
      setDataOwnerId(requestOwner);
    } catch {
      if (generation !== generationRef.current || requestOwner !== currentOwnerRef.current) return;
      setError(`Could not load suggested ${kind}.`);
    } finally {
      if (generation === generationRef.current && requestOwner === currentOwnerRef.current) {
        setLoading(false);
      }
    }
  }, [kind, ownerId]);

  useEffect(() => {
    const actionLock = actionLockRef.current;
    // This effect starts the account-scoped remote read; load owns its state transitions.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      generationRef.current += 1;
      actionLock.clear();
    };
  }, [load]);

  async function act(row: Group | Page) {
    const requestOwner = ownerId;
    const generation = generationRef.current;
    if (!requestOwner) return;
    const actionKind = kind === 'groups' ? 'group' : 'page';
    const key = discoverActionKey(requestOwner, actionKind, row.id);
    const token = actionLockRef.current.acquire(key);
    if (!token) return;
    setBusy((current) => new Set(current).add(key));
    try {
      if (kind === 'groups') await joinGroup(row.id, requestOwner);
      else await followPage(row.id, requestOwner);
      if (generation !== generationRef.current || requestOwner !== currentOwnerRef.current) return;
      showToast(kind === 'groups' ? `Joined ${row.name}` : `Following ${row.name}`);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch {
      if (generation !== generationRef.current || requestOwner !== currentOwnerRef.current) return;
      showToast(kind === 'groups' ? 'Could not join this group.' : 'Could not follow this page.');
    } finally {
      if (generation === generationRef.current && requestOwner === currentOwnerRef.current) {
        setBusy((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
      actionLockRef.current.release(token);
    }
  }

  const visibleRows = dataOwnerId === ownerId ? rows : [];
  if (loading && visibleRows.length === 0) {
    return <View style={styles.center}><ActivityIndicator color={palette.action} /></View>;
  }
  if (error && visibleRows.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={32} color={palette.textFaint} />
        <Text style={styles.emptyTitle}>{error}</Text>
        <Pressable style={styles.retry} onPress={load} hitSlop={2} accessibilityRole="button" accessibilityLabel={`Retry loading ${kind}`}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.results}>
      {error ? <Text style={styles.notice}>{error} Pull up this section again to retry.</Text> : null}
      {visibleRows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name={kind === 'groups' ? 'people-outline' : 'flag-outline'} size={32} color={palette.textFaint} />
          <Text style={styles.emptyTitle}>No public {kind} to suggest yet.</Text>
          <Text style={styles.emptyCopy}>New fitness communities will appear here when they are available.</Text>
        </View>
      ) : visibleRows.map((row) => {
        const actionKind = kind === 'groups' ? 'group' : 'page';
        const isBusy = isDiscoverActionBusy(busy, ownerId, actionKind, row.id);
        return (
        <Pressable
          key={row.id}
          style={styles.row}
          onPress={() => kind === 'groups'
            ? router.push(`/group/${row.id}` as never)
            : router.push(`/page/${row.id}` as never)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${row.name}`}
        >
          <View style={styles.rowIcon}>
            <Ionicons name={kind === 'groups' ? 'people' : 'flag'} size={20} color={palette.action} />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle} numberOfLines={1}>{row.name}</Text>
            <Text style={styles.rowMeta} numberOfLines={2}>
              {kind === 'groups' ? (row as Group).description || 'Public fitness group' : (row as Page).bio || `@${(row as Page).handle}`}
            </Text>
          </View>
          <Pressable
            style={[styles.action, isBusy && styles.disabled]}
            onPress={() => void act(row)}
            hitSlop={5}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityState={{ disabled: isBusy, busy: isBusy }}
            accessibilityLabel={`${kind === 'groups' ? 'Join' : 'Follow'} ${row.name}`}
          >
            {isBusy ? <ActivityIndicator size="small" color={palette.onAction} /> : (
              <Text style={styles.actionText}>{kind === 'groups' ? 'Join' : 'Follow'}</Text>
            )}
          </Pressable>
        </Pressable>
        );
      })}
    </ScrollView>
  );
}

function InterestResults() {
  const { palette, styles } = useDiscoverHubAppearance();
  const router = useRouter();
  const interests = [
    { icon: 'walk-outline' as const, title: 'Running', copy: 'Runs, routes and local challenges', route: '/run' },
    { icon: 'barbell-outline' as const, title: 'Workouts', copy: 'Exercises and training ideas', route: '/gym' },
    { icon: 'trophy-outline' as const, title: 'Challenges', copy: 'Find a goal worth showing up for', route: '/compete' },
  ];
  return (
    <ScrollView contentContainerStyle={styles.results}>
      <Text style={styles.intro}>Explore fitness topics and public content you may like.</Text>
      {interests.map((item) => (
        <Pressable key={item.title} style={styles.row} onPress={() => router.push(item.route as never)} accessibilityRole="button" accessibilityLabel={`Explore ${item.title}`}>
          <View style={styles.rowIcon}><Ionicons name={item.icon} size={20} color={palette.action} /></View>
          <View style={styles.rowCopy}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowMeta}>{item.copy}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

function discoverHubPalette(theme: AppThemeColors, mode: AppThemeMode) {
  return {
    canvas: mode === 'light' ? colors.background : theme.surface.canvas,
    card: mode === 'light' ? colors.card : theme.surface.card,
    border: mode === 'light' ? colors.border : theme.border.subtle,
    primarySoft: mode === 'light' ? colors.primarySoft : theme.surface.raised,
    text: mode === 'light' ? colors.text : theme.ink.primary,
    textMuted: mode === 'light' ? colors.textMuted : theme.ink.muted,
    textFaint: mode === 'light' ? colors.textFaint : theme.ink.muted,
    action: mode === 'light' ? colors.primaryDark : theme.ink.action,
    onAction: mode === 'light' ? '#FFFFFF' : theme.ink.inverse,
    disabledOpacity: mode === 'light' ? 0.65 : theme.interaction.disabledOpacity,
  };
}

function useDiscoverHubAppearance() {
  const { colors: theme, mode } = useAppTheme();
  const palette = useMemo(() => discoverHubPalette(theme, mode), [theme, mode]);
  const styles = useMemo(() => createStyles(palette), [palette]);
  return { palette, styles };
}

type DiscoverHubPalette = ReturnType<typeof discoverHubPalette>;

const createStyles = (palette: DiscoverHubPalette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  tabs: { flexDirection: 'row', gap: 4, padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.card },
  tab: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabActive: { backgroundColor: palette.primarySoft },
  tabText: { fontFamily: font.medium, fontSize: 12.5, color: palette.textMuted },
  tabTextActive: { fontFamily: font.bold, color: palette.action },
  results: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  center: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontFamily: font.bold, fontSize: 16, color: palette.text, textAlign: 'center' },
  emptyCopy: { fontFamily: font.regular, fontSize: 13, color: palette.textMuted, textAlign: 'center' },
  retry: { minHeight: 44, borderRadius: radius.pill, backgroundColor: palette.action, justifyContent: 'center', paddingHorizontal: spacing.xl },
  retryText: { fontFamily: font.bold, color: palette.onAction },
  notice: { fontFamily: font.medium, fontSize: 13, color: palette.textMuted, padding: spacing.sm },
  intro: { fontFamily: font.regular, color: palette.textMuted, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 68, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, ...shadow.card },
  rowIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: font.bold, fontSize: 15, color: palette.text },
  rowMeta: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: palette.textMuted },
  action: { minWidth: 70, minHeight: 38, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: palette.action, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: font.bold, fontSize: 13, color: palette.onAction },
  disabled: { opacity: palette.disabledOpacity },
});
