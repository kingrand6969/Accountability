import { useEffect, useRef, useState } from 'react';
import { Stack, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Platform, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';
import { Anton_400Regular } from '@expo-google-fonts/anton/400Regular';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display/700Bold';
import { Caveat_600SemiBold } from '@expo-google-fonts/caveat/600SemiBold';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { captureReferralFromLaunch, redeemPendingReferral } from '../profiles/referrals';
import { ProProvider } from '../pro/ProProvider';
import { ToastHost } from '../ui/Toast';
import { ConfirmHost } from '../ui/ConfirmDialog';
import { PostMenuHost } from '../feed/PostMenu';
import { ModerationGate } from '../moderation/ModerationGate';
import { colors } from '../ui/theme';
import { cleanupAbandonedRunMedia } from '../activity/runMediaCache';
import { ActivitySyncProvider } from '../activity/ActivitySyncProvider';
import '../notifications/handler';
import '../activity/locationTask';
import {
  createAuthRouteIntentController,
  routeIntentFromPath,
  type RouteQuery,
} from '../navigation/authRouteIntent';
import { navigateBackSafely } from '../navigation/routeAccessContract';

/**
 * A back control that never dead-ends: it pops the stack when there's somewhere
 * to go, and otherwise sends you Home — so a fresh load or deep link into a
 * secondary screen can always get back.
 */
function HeaderBack() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => navigateBackSafely(router)}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={({ pressed }) => [{ paddingRight: 14, paddingVertical: 4 }, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="chevron-back" size={26} color={colors.text} />
    </Pressable>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const query = useGlobalSearchParams() as RouteQuery;
  const ownerId = session?.user.id ?? null;
  const ownerRef = useRef(ownerId);
  const [intentController] = useState(createAuthRouteIntentController);
  const currentIntent = routeIntentFromPath(pathname, query);

  useEffect(() => {
    if (!session && currentIntent) intentController.capture(currentIntent);
  }, [currentIntent, intentController, session]);

  useEffect(() => {
    if (session) return;
    const controller = intentController;
    const ticket = controller.beginAsyncCapture();
    Linking.getInitialURL()
      .then((href) => {
        if (href) controller.completeAsyncCapture(ticket, href);
      })
      .catch(() => {});
  }, [intentController, session]);

  useEffect(() => {
    ownerRef.current = ownerId;
    const destination = intentController.transitionToOwner(ownerId);
    if (!destination || !ownerId) return;
    queueMicrotask(() => {
      if (ownerRef.current === ownerId) router.replace(destination as never);
    });
  }, [intentController, ownerId, router]);

  // Referral attribution: remember an invite link on launch, then credit the
  // inviter once this (new) account is signed in.
  useEffect(() => {
    captureReferralFromLaunch();
  }, []);
  useEffect(() => {
    if (session) redeemPendingReferral();
  }, [session]);

  const [fontsLoaded, fontError] = useFonts({
    Anton_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    PlayfairDisplay_700Bold,
    Caveat_600SemiBold,
  });

  if (loading || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, headerLeft: () => <HeaderBack /> }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="post/[id]" options={{ headerShown: true, title: 'Post' }} />
        <Stack.Screen name="paywall" options={{ headerShown: true, title: 'Go Pro' }} />
        <Stack.Screen name="gym" options={{ headerShown: true, title: 'Exercise Library' }} />
        <Stack.Screen name="exercise/[id]" options={{ headerShown: true, title: 'Exercise' }} />
        <Stack.Screen name="gym-plan" options={{ headerShown: true, title: 'Build my plan' }} />
        <Stack.Screen name="diet" options={{ headerShown: true, title: 'Diet' }} />
        <Stack.Screen name="food-search" options={{ headerShown: true, title: 'Add Food' }} />
        <Stack.Screen name="money-add" options={{ headerShown: true, title: 'Add Transaction' }} />
        <Stack.Screen name="bill-new" options={{ headerShown: true, title: 'Add bill' }} />
        <Stack.Screen
          name="account-new"
          options={{ headerShown: true, title: 'Add bank or wallet' }}
        />
        <Stack.Screen
          name="saving-new"
          options={{ headerShown: true, title: 'Add savings goal' }}
        />
        <Stack.Screen name="debt-new" options={{ headerShown: true, title: 'Add debt' }} />
        <Stack.Screen
          name="shared-goal-new"
          options={{ headerShown: true, title: 'New shared goal' }}
        />
        <Stack.Screen
          name="shared-goal/[id]"
          options={{ headerShown: true, title: 'Saving Buddies' }}
        />
        <Stack.Screen
          name="add"
          options={{ headerShown: true, title: 'Add', presentation: 'modal' }}
        />
        <Stack.Screen
          name="compose"
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        <Stack.Screen name="buddy" options={{ headerShown: true, title: 'Accountability Buddy' }} />
        <Stack.Screen name="compete" options={{ headerShown: true, title: 'Compete' }} />
        <Stack.Screen name="achievements" options={{ headerShown: true, title: 'Trophy Case' }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: true, title: 'Edit profile' }} />
        <Stack.Screen name="challenge/[id]" options={{ headerShown: true, title: 'Challenge' }} />
        <Stack.Screen name="challenge-new" options={{ headerShown: true, title: 'New Challenge' }} />
        <Stack.Screen name="buddy-map" options={{ headerShown: true, title: 'Buddy Location' }} />
        <Stack.Screen name="buddy-chat/[id]" options={{ headerShown: true, title: 'Chat' }} />
        <Stack.Screen name="buddy-card/[id]" options={{ headerShown: true, title: 'Buddy' }} />
        <Stack.Screen name="buddy-medals/[id]" options={{ headerShown: true, title: 'Medals' }} />
        <Stack.Screen name="invite-card" options={{ headerShown: true, title: 'Invite friends' }} />
        <Stack.Screen
          name="buddy-card-edit"
          options={{ headerShown: true, title: 'Your Buddy Card' }}
        />
        <Stack.Screen name="win-card" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ headerShown: true, title: 'Details' }} />
        <Stack.Screen name="insights" options={{ headerShown: true, title: 'Progress' }} />
        <Stack.Screen name="books" options={{ headerShown: true, title: 'Daily Reads' }} />
        <Stack.Screen name="body" options={{ headerShown: true, title: 'Body' }} />
        <Stack.Screen
          name="journey-path"
          options={{ headerShown: true, title: 'Journey Path' }}
        />
        <Stack.Screen name="business" options={{ headerShown: true, title: 'Business' }} />
        <Stack.Screen name="groups" options={{ headerShown: true, title: 'Groups' }} />
        <Stack.Screen name="group/[id]" options={{ headerShown: true, title: 'Group' }} />
        <Stack.Screen name="group-new" options={{ headerShown: true, title: 'New Group' }} />
        <Stack.Screen name="menu" options={{ headerShown: true, title: 'Menu' }} />
        <Stack.Screen name="help" options={{ headerShown: true, title: 'Help & Support' }} />
        <Stack.Screen name="memories" options={{ headerShown: true, title: 'Memories' }} />
        <Stack.Screen name="search" options={{ headerShown: true, title: 'Search' }} />
        <Stack.Screen name="pages" options={{ headerShown: true, title: 'Pages' }} />
        <Stack.Screen name="page/[id]" options={{ headerShown: true, title: 'Page' }} />
        <Stack.Screen name="page-new" options={{ headerShown: true, title: 'New Page' }} />
        <Stack.Screen
          name="story/[userId]"
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="verify-email" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      <Stack.Screen name="share/[id]" options={{ headerShown: true, title: 'Shared update' }} />
      {/* Legal docs are reachable both signed-out (sign-up consent) and in-app (settings). */}
      <Stack.Screen name="legal/[doc]" options={{ headerShown: true, title: 'Legal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    cleanupAbandonedRunMedia().catch((error) => {
      console.warn('Unable to clean abandoned run media.', error);
    });
  }, []);

  return (
    <AuthProvider>
      <ActivitySyncProvider>
        <ProProvider>
          <RootNavigator />
          <ModerationGate />
          <ToastHost />
          <ConfirmHost />
          <PostMenuHost />
        </ProProvider>
      </ActivitySyncProvider>
    </AuthProvider>
  );
}
