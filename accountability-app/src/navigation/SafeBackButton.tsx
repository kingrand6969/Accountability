import type { ComponentProps } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../ui/theme';
import { navigateBackSafely } from './routeAccessContract';

type Router = Parameters<typeof navigateBackSafely>[0];

export function SafeBackButton({
  router: routerOverride,
  accessibilityLabel = 'Go back',
}: {
  router?: Router;
  accessibilityLabel?: string;
}) {
  const expoRouter = useRouter();
  const router = routerOverride ?? expoRouter;
  return (
    <Pressable
      onPress={() => navigateBackSafely(router)}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [{ paddingRight: 14, paddingVertical: 4 }, pressed && { opacity: 0.6 }]}
    >
      <Ionicons
        name={'chevron-back' as ComponentProps<typeof Ionicons>['name']}
        size={26}
        color={colors.text}
      />
    </Pressable>
  );
}

export function notificationHeaderOptions() {
  return {
    headerLeft: () => (
      <SafeBackButton accessibilityLabel="Go back from notifications" />
    ),
  };
}
