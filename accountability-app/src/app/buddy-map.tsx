import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Avatar } from '../feed/Avatar';
import { GlassBackdrop, GlassCard } from '../ui/Glass';
import { contentMaxWidth } from '../ui/responsive';
import { font, radius, spacing } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { INK, INK_SOFT, ACCENT } from '../compete/CompeteUI';
import {
  getBuddyLocations,
  pushLiveLocation,
  stopLiveLocation,
  type BuddyLocation,
} from '../compete/api';

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export default function BuddyMap() {
  const { width } = useWindowDimensions();
  const colMax = contentMaxWidth(width);
  const bgRef = useRef<View>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [rows, setRows] = useState<BuddyLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then((r) => setUid(r.data.user?.id ?? null));
  }, []);

  const load = useCallback(() => {
    return getBuddyLocations()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const mine = rows.find((r) => r.user_id === uid) ?? null;
  const buddies = rows.filter((r) => r.user_id !== uid);
  const sharing = !!mine;

  async function onToggleShare(next: boolean) {
    setWorking(true);
    try {
      if (!next) {
        await stopLiveLocation();
        showToast('Stopped sharing your location');
      } else {
        if (Platform.OS === 'web') {
          Alert.alert('Phone only', 'Live location sharing works in the phone app.');
          return;
        }
        const Location = await import('expo-location');
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission needed', 'Allow location access to share with your buddies.');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({});
        await pushLiveLocation(pos.coords.latitude, pos.coords.longitude);
        showToast('Sharing your live location with buddies');
      }
      await load(); // keep the spinner until state reflects reality (no OFF flicker)
    } catch (e) {
      Alert.alert('Could not update', String((e as Error).message ?? e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <View style={styles.screen}>
      <GlassBackdrop ref={bgRef} columnWidth={colMax} />
      <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: colMax }]}>
        <GlassCard style={styles.card}>
          <View style={styles.shareRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="navigate" size={20} color={ACCENT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shareTitle}>Share my live location</Text>
              <Text style={styles.shareSub}>Only your accepted buddies can see it. Turn off any time.</Text>
            </View>
            {working ? (
              <ActivityIndicator color={ACCENT} />
            ) : (
              <Switch
                value={sharing}
                onValueChange={onToggleShare}
                trackColor={{ true: ACCENT, false: 'rgba(30,27,75,0.2)' }}
              />
            )}
          </View>
        </GlassCard>

        <Text style={styles.section}>Buddies sharing now</Text>

        {loading ? (
          <ActivityIndicator color={ACCENT} style={{ marginTop: 24 }} />
        ) : buddies.length === 0 ? (
          <GlassCard style={styles.card}>
            <Text style={styles.empty}>
              No buddies are sharing right now. When they do, they&apos;ll appear here with how far
              away they are.
            </Text>
          </GlassCard>
        ) : (
          <GlassCard style={styles.card}>
            <View style={styles.listPad}>
              {!mine ? (
                <Text style={styles.distHint}>Turn on your location above to see how far away they are.</Text>
              ) : null}
              {buddies.map((b) => {
                const dist = mine ? haversineKm(mine, b) : null;
                return (
                  <View key={b.user_id} style={styles.row}>
                    <Avatar url={b.avatar} name={b.name} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {b.name?.trim() || 'Buddy'}
                      </Text>
                      <Text style={styles.rowSub}>Updated {ago(b.updated_at)}</Text>
                    </View>
                    {dist != null ? (
                      <Text style={styles.dist}>{dist < 1 ? '<1' : dist.toFixed(dist < 10 ? 1 : 0)} km</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </GlassCard>
        )}

        <Text style={styles.note}>
          A live map view is coming to the phone app. Distances update whenever you or your buddies
          refresh a shared position.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60, width: '100%', alignSelf: 'center' },
  card: {},
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(109,40,217,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareTitle: { fontFamily: font.bold, fontSize: 15, color: INK },
  shareSub: { fontFamily: font.medium, fontSize: 12, color: INK_SOFT, marginTop: 2, lineHeight: 16 },
  section: { fontFamily: font.bold, fontSize: 15, color: INK, marginTop: 4, marginLeft: 4 },
  listPad: { padding: spacing.sm, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8, paddingHorizontal: 4 },
  name: { fontFamily: font.bold, fontSize: 14.5, color: INK },
  rowSub: { fontFamily: font.medium, fontSize: 12, color: INK_SOFT, marginTop: 1 },
  dist: { fontFamily: font.extrabold, fontSize: 14, color: ACCENT },
  distHint: { fontFamily: font.medium, fontSize: 12, color: INK_SOFT, paddingHorizontal: 4, paddingBottom: 6, lineHeight: 16 },
  empty: { fontFamily: font.medium, fontSize: 13.5, color: INK_SOFT, textAlign: 'center', padding: spacing.lg, lineHeight: 19 },
  note: { fontFamily: font.medium, fontSize: 12, color: INK_SOFT, textAlign: 'center', lineHeight: 17, marginTop: 4 },
});
