import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../feed/Avatar';
import { authorLabel } from '../feed/format';
import {
  getBuddyOptIn,
  setBuddyOptIn,
  listCandidates,
  searchBuddies,
  sendRequest,
  listIncoming,
  acceptRequest,
  declineRequest,
  listBuddies,
  blockUser,
  type Candidate,
  type IncomingRequest,
  type Buddy,
} from '../buddy/api';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing, shadow } from '../ui/theme';

type Tab = 'discover' | 'requests' | 'buddies';

export default function BuddyHub() {
  const router = useRouter();
  const [optIn, setOptIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('discover');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [c, r, b] = await Promise.all([listCandidates(), listIncoming(), listBuddies()]);
      setCandidates(c);
      setRequests(r);
      setBuddies(b);
    } catch (e) {
      Alert.alert('Could not load', String((e as Error).message ?? e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        try {
          const on = await getBuddyOptIn();
          setOptIn(on);
          if (on) await loadAll();
        } catch (e) {
          Alert.alert('Could not load', String((e as Error).message ?? e));
        } finally {
          setLoading(false);
        }
      })();
    }, [loadAll]),
  );

  async function turnOn() {
    try {
      await setBuddyOptIn(true);
      setOptIn(true);
      setLoading(true);
      await loadAll();
      setLoading(false);
    } catch (e) {
      Alert.alert('Could not enable', String((e as Error).message ?? e));
    }
  }

  async function onConnect(c: Candidate) {
    setCandidates((cur) => cur.filter((x) => x.id !== c.id));
    setResults((cur) => (cur ? cur.filter((x) => x.id !== c.id) : cur));
    try {
      await sendRequest(c.id);
      showToast(`Request sent to ${authorLabel(c.display_name)}`);
    } catch (e) {
      Alert.alert('Could not send', String((e as Error).message ?? e));
    }
  }

  async function onSearch(text: string) {
    setSearch(text);
    const q = text.trim();
    if (q.length < 2) {
      setResults(null); // back to nearby suggestions
      return;
    }
    setSearching(true);
    try {
      setResults(await searchBuddies(q));
    } catch {
      // keep previous results — user can retype
    } finally {
      setSearching(false);
    }
  }

  function onBlock(id: string) {
    Alert.alert('Block this person?', 'They won’t appear again or be able to contact you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          setCandidates((cur) => cur.filter((x) => x.id !== id));
          try {
            await blockUser(id);
          } catch (e) {
            Alert.alert('Could not block', String((e as Error).message ?? e));
          }
        },
      },
    ]);
  }

  async function onAccept(r: IncomingRequest) {
    setRequests((cur) => cur.filter((x) => x.id !== r.id));
    try {
      await acceptRequest(r.id);
      await loadAll();
      setTab('buddies');
      showToast(`Linked with ${authorLabel(r.name)} 🤝 — say hi!`);
    } catch (e) {
      Alert.alert('Could not accept', String((e as Error).message ?? e));
    }
  }

  async function onDecline(r: IncomingRequest) {
    setRequests((cur) => cur.filter((x) => x.id !== r.id));
    try {
      await declineRequest(r.id);
    } catch (e) {
      Alert.alert('Could not decline', String((e as Error).message ?? e));
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!optIn) {
    return (
      <View style={styles.gate}>
        <View style={styles.gateIcon}>
          <Ionicons name="people" size={44} color={colors.primary} />
        </View>
        <Text style={styles.gateTitle}>Find an Accountability Buddy</Text>
        <Text style={styles.gateText}>
          Get matched with someone in your area to train with and keep each other
          on track. You only connect if you both say yes, and you can chat once
          you&apos;re linked.
        </Text>
        <View style={styles.gateBadges}>
          <Text style={styles.gateSmall}>Off by default</Text>
          <Text style={styles.gateSmall}>·</Text>
          <Text style={styles.gateSmall}>Approximate area only</Text>
          <Text style={styles.gateSmall}>·</Text>
          <Text style={styles.gateSmall}>Block & report anytime</Text>
          <Text style={styles.gateSmall}>·</Text>
          <Text style={styles.gateSmall}>18+</Text>
        </View>
        <Button title="Turn on buddy matching" onPress={turnOn} style={styles.gateBtn} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {(['discover', 'requests', 'buddies'] as const).map((t) => (
          <Pressable
            key={t}
            style={({ pressed }) => [
              styles.tab,
              tab === t && styles.tabActive,
              pressed && styles.pressed,
            ]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'discover'
                ? 'Discover'
                : t === 'requests'
                  ? `Requests${requests.length ? ` (${requests.length})` : ''}`
                  : 'Buddies'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => router.push('/buddy-card-edit' as never)}
        style={({ pressed }) => [styles.customizeRow, pressed && styles.pressed]}
        accessibilityLabel="Customize your buddy card"
      >
        <Ionicons name="color-palette-outline" size={15} color={colors.primary} />
        <Text style={styles.customizeText}>Customize how others see your buddy card</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push('/compete' as never)}
        style={({ pressed }) => [styles.customizeRow, pressed && styles.pressed]}
        accessibilityLabel="Compete with your buddies"
      >
        <Ionicons name="trophy-outline" size={15} color={colors.primary} />
        <Text style={styles.customizeText}>Compete with your buddies &amp; climb the leaderboards</Text>
      </Pressable>

      {tab === 'discover' ? (
        <FlatList
          data={results ?? candidates}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={17} color={colors.textFaint} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name — add a buddy you know"
                placeholderTextColor={colors.textFaint}
                value={search}
                onChangeText={onSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searching ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : search.length > 0 ? (
                <Pressable onPress={() => onSearch('')} hitSlop={8} accessibilityLabel="Clear search">
                  <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
          }
          ListFooterComponent={
            <Pressable
              style={({ pressed }) => [styles.inviteRow, pressed && styles.pressed]}
              onPress={() => router.push('/invite-card' as never)}
              accessibilityLabel="Invite friends to AccountAbility"
            >
              <Ionicons name="paper-plane-outline" size={17} color={colors.primary} />
              <Text style={styles.inviteText}>
                Friend not here yet? Invite them via Messenger, WhatsApp…
              </Text>
            </Pressable>
          }
          ListEmptyComponent={
            results ? (
              <EmptyState
                icon="person-outline"
                title="No one found"
                subtitle="They may not be on AccountAbility yet — or they keep buddy matching off (their choice is respected)."
              />
            ) : (
              <EmptyState
                icon="search-outline"
                title="No one new in your area yet"
                subtitle="Search a name above, or set your area on your profile so others can find you."
              />
            )
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() =>
                router.push({ pathname: '/buddy-card/[id]', params: { id: item.id } } as never)
              }
              accessibilityLabel={`View ${authorLabel(item.display_name)}'s buddy card`}
            >
              <Avatar url={item.avatar_url} name={item.display_name} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{authorLabel(item.display_name)}</Text>
                {item.area ? <Text style={styles.meta}>{item.area}</Text> : null}
              </View>
              <Pressable
                style={({ pressed }) => [styles.connectBtn, pressed && styles.pressed]}
                onPress={() => onConnect(item)}
              >
                <Text style={styles.connectText}>Connect</Text>
              </Pressable>
              <Pressable
                onPress={() => onBlock(item.id)}
                hitSlop={8}
                style={({ pressed }) => [styles.blockBtn, pressed && styles.pressed]}
                accessibilityLabel={`Block ${authorLabel(item.display_name)}`}
              >
                <Ionicons name="ban-outline" size={18} color={colors.danger} />
              </Pressable>
            </Pressable>
          )}
        />
      ) : tab === 'requests' ? (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="mail-open-outline"
              title="No pending requests"
              subtitle="When someone wants to team up, it shows here."
            />
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar url={item.avatar} name={item.name} size={44} />
              <Text style={[styles.name, { flex: 1 }]}>{authorLabel(item.name)}</Text>
              <Pressable
                style={({ pressed }) => [styles.connectBtn, pressed && styles.pressed]}
                onPress={() => onAccept(item)}
              >
                <Text style={styles.connectText}>Accept</Text>
              </Pressable>
              <Pressable
                onPress={() => onDecline(item)}
                hitSlop={8}
                style={({ pressed }) => [styles.blockBtn, pressed && styles.pressed]}
                accessibilityLabel={`Decline ${authorLabel(item.name)}`}
              >
                <Ionicons name="close" size={20} color={colors.textFaint} />
              </Pressable>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={buddies}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title="No buddies yet"
              subtitle="Connect with someone in Discover — once you both say yes, you can chat."
              actionTitle="Go to Discover"
              onAction={() => setTab('discover')}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/buddy-chat/[id]', params: { id: item.id } })}
              accessibilityLabel={`Chat with ${authorLabel(item.name)}`}
            >
              <Avatar url={item.avatar} name={item.name} size={44} />
              <Text style={[styles.name, { flex: 1 }]}>{authorLabel(item.name)}</Text>
              <View style={styles.chatHintWrap}>
                <Ionicons name="chatbubble-outline" size={15} color={colors.primary} />
                <Text style={styles.chatHint}>Chat</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.75 },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  gateIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateTitle: {
    fontSize: 22,
    fontFamily: font.extrabold,
    textAlign: 'center',
    color: colors.text,
  },
  gateText: {
    color: colors.textSecondary,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: 21,
  },
  gateBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  gateSmall: { color: colors.textFaint, fontFamily: font.medium, fontSize: 12 },
  gateBtn: { marginTop: spacing.sm, minWidth: 240 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    minHeight: 46,
    marginBottom: spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    paddingVertical: 10,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: spacing.md,
    minHeight: 48,
    marginTop: spacing.xs,
  },
  inviteText: {
    color: colors.primary,
    fontFamily: font.semibold,
    fontSize: 13.5,
    flexShrink: 1,
  },
  tabs: { flexDirection: 'row', padding: spacing.sm, gap: spacing.sm },
  customizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: spacing.xs,
    minHeight: 32,
  },
  customizeText: { color: colors.primary, fontFamily: font.semibold, fontSize: 12.5 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    minHeight: 40,
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textSecondary, fontFamily: font.semibold, fontSize: 13 },
  tabTextActive: { color: '#fff' },
  list: { padding: spacing.md, gap: 10, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 64,
    ...shadow.card,
  },
  name: { fontSize: 15, fontFamily: font.bold, color: colors.text },
  meta: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  connectBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: 'center',
  },
  connectText: { color: '#fff', fontFamily: font.bold, fontSize: 13 },
  blockBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatHintWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chatHint: { color: colors.primary, fontFamily: font.bold, fontSize: 14 },
});
