import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useFonts, Anton_400Regular } from '@expo-google-fonts/anton';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { ProProvider } from '../pro/ProProvider';
import { ToastHost } from '../ui/Toast';
import '../notifications/handler';
import '../activity/locationTask';

function RootNavigator() {
  const { session, loading } = useAuth();
  const [fontsLoaded] = useFonts({
    Anton_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (loading || !fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
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
        <Stack.Screen name="money" options={{ headerShown: true, title: 'Money' }} />
        <Stack.Screen name="money-add" options={{ headerShown: true, title: 'Add Transaction' }} />
        <Stack.Screen name="activity-track" options={{ headerShown: true, title: 'Track Activity' }} />
        <Stack.Screen name="buddy" options={{ headerShown: true, title: 'Accountability Buddy' }} />
        <Stack.Screen name="buddy-chat/[id]" options={{ headerShown: true, title: 'Chat' }} />
        <Stack.Screen name="buddy-card/[id]" options={{ headerShown: true, title: 'Buddy' }} />
        <Stack.Screen
          name="buddy-card-edit"
          options={{ headerShown: true, title: 'Your Buddy Card' }}
        />
        <Stack.Screen name="win-card" options={{ headerShown: true, title: 'Share a win' }} />
        <Stack.Screen name="item/[id]" options={{ headerShown: true, title: 'Details' }} />
        <Stack.Screen name="insights" options={{ headerShown: true, title: 'Progress' }} />
        <Stack.Screen name="books" options={{ headerShown: true, title: 'Daily Reads' }} />
        <Stack.Screen name="groups" options={{ headerShown: true, title: 'Groups' }} />
        <Stack.Screen name="group/[id]" options={{ headerShown: true, title: 'Group' }} />
        <Stack.Screen name="group-new" options={{ headerShown: true, title: 'New Group' }} />
        <Stack.Screen name="menu" options={{ headerShown: true, title: 'Menu' }} />
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
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ProProvider>
        <RootNavigator />
        <ToastHost />
      </ProProvider>
    </AuthProvider>
  );
}
