import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Avatar } from '../feed/Avatar';
import { authorLabel } from '../feed/format';
import {
  getBuddyOptIn,
  setBuddyOptIn,
  listCandidates,
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

type Tab = 'discover' | 'requests' | 'buddies';

export default function BuddyHub() {
  const router = useRouter();
  const [optIn, setOptIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('discover');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [buddies, setBuddies] = useState<Buddy[]>([]);

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
    try {
      await sendRequest(c.id);
      Alert.alert('Request sent', `We'll link you up if ${authorLabel(c.display_name)} accepts.`);
    } catch (e) {
      Alert.alert('Could not send', String((e as Error).message ?? e));
    }
  }

  async function onBlock(id: string) {
    setCandidates((cur) => cur.filter((x) => x.id !== id));
    try {
      await blockUser(id);
    } catch (e) {
      Alert.alert('Could not block', String((e as Error).message ?? e));
    }
  }

  async function onAccept(r: IncomingRequest) {
    setRequests((cur) => cur.filter((x) => x.id !== r.id));
    try {
      await acceptRequest(r.id);
      await loadAll();
      Alert.alert('Linked! 🤝', `You and ${authorLabel(r.name)} are now buddies — say hi!`);
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
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!optIn) {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateEmoji}>🤝</Text>
        <Text style={styles.gateTitle}>Find an Accountability Buddy</Text>
        <Text style={styles.gateText}>
          Get matched with someone in your area to train with and keep each other
          on track. You only connect if you both say yes, and you can chat once
          you&apos;re linked.
        </Text>
        <Text style={styles.gateSmall}>
          Off by default · approximate area only · block & report anytime · 18+.
        </Text>
        <Pressable style={styles.gateBtn} onPress={turnOn}>
          <Text style={styles.gateBtnText}>Turn on buddy matching</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {(['discover', 'requests', 'buddies'] as const).map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'discover' ? 'Discover' : t === 'requests' ? `Requests (${requests.length})` : 'Buddies'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'discover' ? (
        <FlatList
          data={candidates}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No one new in your area yet. Check back soon!</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar url={item.avatar_url} name={item.display_name} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{authorLabel(item.display_name)}</Text>
                {item.area ? <Text style={styles.meta}>{item.area}</Text> : null}
              </View>
              <Pressable style={styles.connectBtn} onPress={() => onConnect(item)}>
                <Text style={styles.connectText}>Connect</Text>
              </Pressable>
              <Pressable onPress={() => onBlock(item.id)} hitSlop={8} style={styles.blockBtn}>
                <Text style={styles.blockText}>Block</Text>
              </Pressable>
            </View>
          )}
        />
      ) : tab === 'requests' ? (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No pending requests.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar url={item.avatar} name={item.name} size={44} />
              <Text style={[styles.name, { flex: 1 }]}>{authorLabel(item.name)}</Text>
              <Pressable style={styles.connectBtn} onPress={() => onAccept(item)}>
                <Text style={styles.connectText}>Accept</Text>
              </Pressable>
              <Pressable onPress={() => onDecline(item)} hitSlop={8} style={styles.blockBtn}>
                <Text style={styles.blockText}>Decline</Text>
              </Pressable>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={buddies}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No buddies yet. Connect in Discover!</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push({ pathname: '/buddy-chat/[id]', params: { id: item.id } })}
            >
              <Avatar url={item.avatar} name={item.name} size={44} />
              <Text style={[styles.name, { flex: 1 }]}>{authorLabel(item.name)}</Text>
              <Text style={styles.chatHint}>Chat ›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  gateEmoji: { fontSize: 52 },
  gateTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  gateText: { color: '#444', textAlign: 'center', lineHeight: 21 },
  gateSmall: { color: '#888', fontSize: 12, textAlign: 'center' },
  gateBtn: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, marginTop: 8 },
  gateBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  tabs: { flexDirection: 'row', padding: 10, gap: 8 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center' },
  tabActive: { backgroundColor: '#2563eb' },
  tabText: { color: '#444', fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: '#fff' },
  list: { padding: 12, gap: 10 },
  empty: { textAlign: 'center', color: '#888', marginTop: 30 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f7f7f9',
    borderRadius: 12,
    padding: 12,
  },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { color: '#666', fontSize: 13, marginTop: 2 },
  connectBtn: { backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  connectText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  blockBtn: { paddingVertical: 8, paddingHorizontal: 6 },
  blockText: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
  chatHint: { color: '#2563eb', fontWeight: '700' },
});
