import { type ComponentProps, useEffect, useState } from 'react';
import { type ColorValue, Pressable, Text, View } from 'react-native';
import { Link, Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { font } from '../../ui/theme';
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
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarIcon: tabIcon('today', 'today-outline') }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: tabIcon('people', 'people-outline'),
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="flame" size={20} color="#fbbf24" />
              <Text style={{ fontFamily: font.extrabold, fontSize: 18, letterSpacing: 0.3 }}>
                Account
                <Text style={{ color: '#2563eb' }}>Ability</Text>
              </Text>
            </View>
          ),
          headerRight: () => (
            <Link href="/groups" asChild>
              <Pressable
                style={({ pressed }) => ({
                  marginRight: 16,
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                })}
                accessibilityLabel="Groups"
              >
                <Ionicons name="people-circle-outline" size={26} color={colors.primary} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{ title: 'Add', tabBarIcon: tabIcon('add-circle', 'add-circle-outline') }}
      />
      <Tabs.Screen
        name="activity"
        options={{ title: 'Track', tabBarIcon: tabIcon('barbell', 'barbell-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: tabIcon('person', 'person-outline'),
          headerShown: false, // cover photo runs edge-to-edge, FB-style
        }}
      />
    </Tabs>
  );
}
