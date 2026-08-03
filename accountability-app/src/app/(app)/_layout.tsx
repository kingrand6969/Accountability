import { type ComponentProps, useEffect, useState } from 'react';
import { type ColorValue, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Redirect, Tabs, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onboardedKey } from '../onboarding';
import { useAuth } from '../../auth/AuthProvider';
import { floatingTabBarStyle } from '../../ui/floatingTabBar';
import { GlassTabBar } from '../../ui/GlassTabBar';
import { useUnreadMessages } from '../../buddy/useUnreadMessages';
import { getMyProfile, touchLastActive } from '../../profiles/api';
import { colors } from '../../ui/theme';
import { statusBarStyleForPath } from '../../navigation/routeAccessContract';
import { notificationHeaderOptions } from '../../navigation/SafeBackButton';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Quiet tab icon: selected destinations use the approved deep-navy ink. */
function tabIcon(active: IoniconName, inactive: IoniconName) {
  return function TabIcon({
    color,
    size,
    focused,
  }: {
    color: ColorValue;
    size: number;
    focused: boolean;
  }) {
    return (
      <Ionicons
        name={focused ? active : inactive}
        size={size}
        color={focused ? colors.navy : color}
      />
    );
  };
}

/** Messages icon with a live unread dot — lights up when something lands. */
function MessagesTabIcon({
  color,
  size,
  focused,
  unread,
}: {
  color: ColorValue;
  size: number;
  focused: boolean;
  unread: number;
}) {
  return (
    <View style={styles.messageIcon}>
      <Ionicons
        name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
        size={size}
        color={focused ? colors.navy : color}
      />
      {unread > 0 && !focused ? <View style={styles.unreadDot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  messageIcon: { width: 32, height: 28, alignItems: 'center', justifyContent: 'center' },
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
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const userId = session?.user.id ?? null;
  const { unread: unreadMessages } = useUnreadMessages(userId);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) return; // route guard in the root layout handles signed-out
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the previous account before async hydration
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
    <>
      <StatusBar style={statusBarStyleForPath(pathname)} />
      <Tabs
      // custom quiet bar — guarantees the approved five destinations and spacing
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#475569',
        tabBarShowLabel: true,
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
              style={{ width: 124, height: 30 }}
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
          title: 'Journey',
          tabBarIcon: tabIcon('map', 'map-outline'),
          headerShown: false, // glass hero runs edge-to-edge
        }}
      />
      {/* the GPS run tracker, one tap from the bar */}
      <Tabs.Screen
        name="run"
        options={{
          title: 'Run',
          tabBarIcon: tabIcon('walk', 'walk-outline'),
          headerShown: false, // immersive full-screen tracker
        }}
      />
      {/* messages — buddy conversations inbox, live via realtime */}
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: (p) => <MessagesTabIcon {...p} unread={unreadMessages} />,
          headerShown: true,
        }}
      />
      {/* notifications live in the Feed header now — keep the route reachable */}
      <Tabs.Screen
        name="notifications"
        options={{
          ...notificationHeaderOptions(),
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
    </>
  );
}
