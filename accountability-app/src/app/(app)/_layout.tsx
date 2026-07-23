import { type ComponentProps, useEffect, useState } from 'react';
import { type ColorValue, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onboardedKey } from '../onboarding';
import { useAuth } from '../../auth/AuthProvider';
import { floatingTabBarStyle } from '../../ui/floatingTabBar';
import { GlassTabBar } from '../../ui/GlassTabBar';
import { useUnreadMessages } from '../../buddy/useUnreadMessages';
import { getMyProfile, touchLastActive } from '../../profiles/api';
import { colors } from '../../ui/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Floating-island tab bar: icon-only, the active icon sits in a dark
 *  squircle — you always see which page you're on. */
function tabIcon(active: IoniconName, inactive: IoniconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <View style={[styles.iconPill, focused && styles.iconPillActive]}>
      <Ionicons
        name={focused ? active : inactive}
        size={size - 2}
        color={focused ? '#fff' : color}
      />
    </View>
  );
}

/** Bell icon with a live unread dot — lights up the instant something lands. */
function MessagesTabIcon({
  color,
  size,
  focused,
}: {
  color: ColorValue;
  size: number;
  focused: boolean;
}) {
  const { unread } = useUnreadMessages();
  return (
    <View style={[styles.iconPill, focused && styles.iconPillActive]}>
      <Ionicons
        name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
        size={size - 2}
        color={focused ? '#fff' : color}
      />
      {unread > 0 && !focused ? <View style={styles.unreadDot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  iconPill: {
    width: 44,
    height: 34,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: { backgroundColor: '#0f172a' },
  unreadDot: {
    position: 'absolute',
    top: 5,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#db2777',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});

export default function AppLayout() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const userId = session?.user.id ?? null;
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) return; // route guard in the root layout handles signed-out
    let alive = true;
    setOnboarded(null);
    (async () => {
      // 1) fast path — this device already finished onboarding
      try {
        const flag = await AsyncStorage.getItem(onboardedKey(userId));
        if (flag === '1') {
          if (alive) setOnboarded(true);
          return;
        }
      } catch {
        /* storage unavailable — fall through to the profile check */
      }
      // 2) new device / cleared storage: the SERVER is the source of truth. A
      //    profile that already has a name and an area is onboarded — never make
      //    an existing member retype it just because this device forgot.
      try {
        const profile = await getMyProfile();
        const done = !!profile?.display_name?.trim() && !!profile?.area?.trim();
        if (alive) setOnboarded(done);
        if (done) AsyncStorage.setItem(onboardedKey(userId), '1').catch(() => {});
      } catch {
        if (alive) setOnboarded(true); // fail open — never trap someone on setup
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  // presence heartbeat — keeps last_active_at fresh so buddies see me "online"
  useEffect(() => {
    if (!userId) return;
    touchLastActive().catch(() => {});
    const t = setInterval(() => touchLastActive().catch(() => {}), 90_000);
    return () => clearInterval(t);
  }, [userId]);

  if (onboarded === null) return <View style={{ flex: 1 }} />;
  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      // custom glassmorphic bar — guarantees even icon distribution + frosted glass
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#475569',
        tabBarShowLabel: false,
        // kept so the run screen can hide the bar via tabBarStyle:{display:'none'}
        tabBarStyle: floatingTabBarStyle(winW, insets.bottom),
        tabBarItemStyle: {
          height: 62,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }}
    >
      {/* Feed is home — the app opens social-first */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: tabIcon('home', 'home-outline'),
          // pin the wordmark to the left (iOS centres by default, which collides
          // with the right-hand icons on a phone) and keep it compact
          headerTitleAlign: 'left',
          headerTitle: () => (
            <Image
              source={require('../../../assets/images/wordmark.png')}
              style={{ width: 132, height: 21 }}
              resizeMode="contain"
              accessibilityLabel="AccountAbility"
            />
          ),
          // headerLeft/right (menu, create, pages, groups) are set by the
          // Feed screen itself via navigation.setOptions — it needs screen state.
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: 'Finance',
          tabBarIcon: tabIcon('wallet', 'wallet-outline'),
          headerShown: false, // glass hero runs edge-to-edge
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Exercise',
          tabBarIcon: tabIcon('barbell', 'barbell-outline'),
          headerShown: false, // glass hero runs edge-to-edge
        }}
      />
      {/* the GPS run tracker, one tap from the bar */}
      <Tabs.Screen
        name="run"
        options={{
          title: 'Track Run',
          tabBarIcon: tabIcon('walk', 'walk-outline'),
          headerShown: false, // immersive full-screen tracker
        }}
      />
      {/* messages — buddy conversations inbox, live via realtime */}
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: (p) => <MessagesTabIcon {...p} />,
          headerShown: true,
        }}
      />
      {/* notifications live in the Feed header now — keep the route reachable */}
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
          tabBarItemStyle: { display: 'none' },
          headerShown: true,
          title: 'Notifications',
        }}
      />
      {/* Planner (Today) lives in the ☰ Menu now — route stays reachable */}
      <Tabs.Screen
        name="today"
        options={{
          href: null,
          tabBarItemStyle: { display: 'none' },
          headerShown: false, // glass backdrop + hero run edge-to-edge
        }}
      />
      {/* Profile lives in the ☰ Menu now — hidden from the tab bar but the
          /profile route stays reachable */}
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
          // href:null hides the button but on native still reserves a flex slot,
          // leaving dead space on the right of the bar — collapse it entirely
          tabBarItemStyle: { display: 'none' },
          headerShown: false, // cover photo runs edge-to-edge, FB-style
        }}
      />
    </Tabs>
  );
}
