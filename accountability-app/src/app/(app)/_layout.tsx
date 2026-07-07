import { type ComponentProps, useEffect, useState } from 'react';
import { type ColorValue, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onboardedKey } from '../onboarding';
import { useAuth } from '../../auth/AuthProvider';
import { floatingTabBarStyle } from '../../ui/floatingTabBar';
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

const styles = StyleSheet.create({
  iconPill: {
    width: 54,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: { backgroundColor: '#0f172a' },
});

export default function AppLayout() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const userId = session?.user.id ?? null;
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) return; // route guard in the root layout handles signed-out
    setOnboarded(null);
    AsyncStorage.getItem(onboardedKey(userId))
      .then((v) => setOnboarded(v === '1'))
      .catch(() => setOnboarded(true));
  }, [userId]);

  if (onboarded === null) return <View style={{ flex: 1 }} />;
  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#475569',
        tabBarShowLabel: false,
        // floating island, detached from the screen edges (shared so the run
        // screen can hide/restore it)
        tabBarStyle: floatingTabBarStyle(winW, insets.bottom),
        tabBarItemStyle: {
          height: 62,
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 12,
        },
      }}
    >
      {/* Feed is the home tab — the app opens social-first, like Facebook */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: tabIcon('people', 'people-outline'),
          headerTitle: () => (
            <Image
              source={require('../../../assets/images/wordmark.png')}
              style={{ width: 168, height: 26 }}
              resizeMode="contain"
              accessibilityLabel="AccountAbility"
            />
          ),
          // headerLeft/right (menu, create, pages, groups) are set by the
          // Feed screen itself via navigation.setOptions — it needs screen state.
        }}
      />
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: tabIcon('today', 'today-outline'),
          headerShown: false, // glass backdrop + hero run edge-to-edge
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: 'Finance',
          tabBarIcon: tabIcon('wallet', 'wallet-outline'),
          headerShown: false, // gradient hero runs edge-to-edge
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Track',
          tabBarIcon: tabIcon('barbell', 'barbell-outline'),
          headerShown: false, // gradient hero runs edge-to-edge
        }}
      />
      {/* Activity — the GPS run tracker, one tap from the bar */}
      <Tabs.Screen
        name="run"
        options={{
          title: 'Activity',
          tabBarIcon: tabIcon('walk', 'walk-outline'),
          headerShown: false, // immersive full-screen tracker
        }}
      />
      {/* Profile lives in the ☰ Menu now — hidden from the tab bar but the
          /profile route stays reachable */}
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
          headerShown: false, // cover photo runs edge-to-edge, FB-style
        }}
      />
    </Tabs>
  );
}
