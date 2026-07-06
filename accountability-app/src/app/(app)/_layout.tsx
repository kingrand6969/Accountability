import { type ComponentProps, useEffect, useState } from 'react';
import { type ColorValue, Image, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onboardedKey } from '../onboarding';
import { useAuth } from '../../auth/AuthProvider';
import { colors } from '../../ui/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(active: IoniconName, inactive: IoniconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={size} color={color} />
  );
}

export default function AppLayout() {
  const { session } = useAuth();
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
    <Tabs screenOptions={{ headerShown: true, tabBarActiveTintColor: colors.primary }}>
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
        options={{ title: 'Today', tabBarIcon: tabIcon('today', 'today-outline') }}
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
