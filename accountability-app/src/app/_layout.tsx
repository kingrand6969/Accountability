import { useEffect, useRef, useState } from 'react';
import { Stack, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { Linking, Platform, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { Anton_400Regular } from '@expo-google-fonts/anton/400Regular';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display/700Bold';
import { Caveat_600SemiBold } from '@expo-google-fonts/caveat/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import { BowlbyOneSC_400Regular } from '@expo-google-fonts/bowlby-one-sc/400Regular';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { captureReferralFromLaunch, redeemPendingReferral } from '../profiles/referrals';
import { ProProvider } from '../pro/ProProvider';
import { ToastHost } from '../ui/Toast';
import { ConfirmHost } from '../ui/ConfirmDialog';
import { PostMenuHost } from '../feed/PostMenu';
import { ModerationGate } from '../moderation/ModerationGate';
import { cleanupAbandonedRunMedia } from '../activity/runMediaCache';
import { ActivitySyncProvider } from '../activity/ActivitySyncProvider';
import { LocationCollectorBootGate } from '../activity/LocationCollectorBootGate';
import { LocationCollectorOwnerGate } from '../activity/LocationCollectorOwnerGate';
import '../notifications/handler';
import '../activity/locationTask';
import {
  createAuthRouteIntentController,
  onboardingStorageKey,
  routeIntentFromPath,
  subscribeToOnboardingCompletion,
  type RouteQuery,
} from '../navigation/authRouteIntent';
import { navigateBackSafely } from '../navigation/routeAccessContract';
import { AppLaunchState } from '../ui/AppLaunchState';
import { AppThemeProvider, useAppTheme } from '../ui/AppThemeProvider';
import { getMyProfile } from '../profiles/api';

type OnboardingState = Readonly<{
  ownerId: string;
  complete: boolean;
  failed?: boolean;
}>;

/**
 * A back control that never dead-ends: it pops the stack when there's somewhere
 * to go, and otherwise sends you Home — so a fresh load or deep link into a
 * secondary screen can always get back.
 */
function HeaderBack() {
  const router = useRouter();
  const { colors: theme } = useAppTheme();
  return (
    <Pressable
      onPress={() => navigateBackSafely(router)}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={({ pressed }) => [{ paddingRight: 14, paddingVertical: 4 }, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="chevron-back" size={26} color={theme.ink.primary} />
    </Pressable>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();
  const { colors: theme } = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const query = useGlobalSearchParams() as RouteQuery;
  const ownerId = session?.user.id ?? null;
  const ownerRef = useRef(ownerId);
  const initialLinkCaptureStartedRef = useRef(false);
  const [intentController] = useState(() => createAuthRouteIntentController(ownerId));
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [onboardingAttempt, setOnboardingAttempt] = useState(0);
  const ownerOnboardingState = ownerId && onboardingState?.ownerId === ownerId
    ? onboardingState
    : null;
  const onboardingFailed = ownerOnboardingState?.failed === true;
  const onboarded = ownerId
    ? ownerOnboardingState && !onboardingFailed
      ? ownerOnboardingState.complete
      : null
    : false;
  const currentIntent = routeIntentFromPath(pathname, query);

  useEffect(() => {
    if (!session && currentIntent) intentController.capture(currentIntent);
  }, [currentIntent, intentController, session]);

  useEffect(() => {
    if (!ownerId || onboarded === true || !currentIntent) return;
    intentController.captureForOwner(ownerId, currentIntent);
  }, [currentIntent, intentController, onboarded, ownerId]);

  useEffect(() => {
    if (initialLinkCaptureStartedRef.current) return;
    initialLinkCaptureStartedRef.current = true;
    if (ownerRef.current) return;
    const controller = intentController;
    const ticket = controller.beginAsyncCapture();
    Linking.getInitialURL()
      .then((href) => {
        if (href) controller.completeAsyncCapture(ticket, href);
      })
      .catch(() => {});
  }, [intentController]);

  useEffect(() => {
    ownerRef.current = ownerId;
    intentController.transitionToOwner(ownerId);
  }, [intentController, ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(onboardingStorageKey(ownerId));
        if (stored === '1') {
          if (active) setOnboardingState({ ownerId, complete: true });
          return;
        }
        const profile = await getMyProfile();
        const complete = !!profile?.display_name?.trim() && !!profile?.area?.trim();
        if (active) {
          setOnboardingState((current) =>
            current?.ownerId === ownerId && current.complete
              ? current
              : { ownerId, complete, failed: false },
          );
        }
        if (complete) {
          AsyncStorage.setItem(onboardingStorageKey(ownerId), '1').catch(() => {});
        }
      } catch {
        if (active) {
          setOnboardingState((current) =>
            current?.ownerId === ownerId && current.complete
              ? current
              : { ownerId, complete: false, failed: true },
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [onboardingAttempt, ownerId]);

  useEffect(() => subscribeToOnboardingCompletion((completedOwnerId) => {
    if (ownerRef.current !== completedOwnerId) return;
    setOnboardingState((current) =>
      current?.ownerId === completedOwnerId && current.complete
        ? current
        : { ownerId: completedOwnerId, complete: true, failed: false },
    );
  }), []);

  useEffect(() => {
    if (!ownerId || onboarded !== true) return;
    const destination = intentController.resumeForOwner(ownerId, true);
    const target = destination ?? (pathname === '/onboarding' ? '/' : null);
    if (!target) return;
    queueMicrotask(() => {
      if (ownerRef.current === ownerId) router.replace(target as never);
    });
  }, [intentController, onboarded, ownerId, pathname, router]);

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
    SpaceGrotesk_700Bold,
    Sora_700Bold,
    BowlbyOneSC_400Regular,
  });

  if (loading || (!fontsLoaded && !fontError)) {
    return <AppLaunchState message="Opening Mantle" />;
  }

  if (!!session && onboardingFailed) {
    return (
      <AppLaunchState
        message="We could not check your account setup"
        error
        actionLabel="Try again"
        onAction={() => {
          setOnboardingState((current) =>
            current?.ownerId === ownerId && current.failed ? null : current,
          );
          setOnboardingAttempt((attempt) => attempt + 1);
        }}
      />
    );
  }

  if (!!session && onboarded === null) {
    return <AppLaunchState message="Opening Mantle" />;
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          headerLeft: () => <HeaderBack />,
          headerStyle: { backgroundColor: theme.surface.raised },
          headerTintColor: theme.ink.primary,
          headerTitleStyle: { color: theme.ink.primary },
          contentStyle: { backgroundColor: theme.surface.canvas },
        }}
      >
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && onboarded === true}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="paywall" options={{ headerShown: true, title: 'Go Pro' }} />
        <Stack.Screen name="gym" options={{ headerShown: true, title: 'Exercise Library' }} />
        <Stack.Screen name="exercise/[id]" options={{ headerShown: true, title: 'Exercise' }} />
        <Stack.Screen name="gym-plan" options={{ headerShown: true, title: 'Build my plan' }} />
        <Stack.Screen name="diet" options={{ headerShown: true, title: 'Diet' }} />
        <Stack.Screen name="food-search" options={{ headerShown: true, title: 'Add Food' }} />
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
        <Stack.Screen name="buddy-medals/[id]" options={{ headerShown: true, title: 'Medals and Challenges' }} />
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
        <Stack.Screen name="journey-progress" options={{ headerShown: false }} />
        <Stack.Screen name="groups" options={{ headerShown: true, title: 'Groups' }} />
        <Stack.Screen name="group/[id]" options={{ headerShown: true, title: 'Group' }} />
        <Stack.Screen name="group-new" options={{ headerShown: true, title: 'New Group' }} />
        <Stack.Screen name="menu" options={{ headerShown: true, title: 'Menu' }} />
        <Stack.Screen name="discover" options={{ headerShown: true, title: 'Discover' }} />
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
    </>
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
    <AppThemeProvider>
      <LocationCollectorBootGate>
        <AuthProvider>
          <LocationCollectorOwnerGate>
            <ActivitySyncProvider>
              <ProProvider>
                <RootNavigator />
                <ModerationGate />
                <ToastHost />
                <ConfirmHost />
                <PostMenuHost />
              </ProProvider>
            </ActivitySyncProvider>
          </LocationCollectorOwnerGate>
        </AuthProvider>
      </LocationCollectorBootGate>
    </AppThemeProvider>
  );
}
