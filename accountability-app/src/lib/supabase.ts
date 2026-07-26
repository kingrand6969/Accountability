import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform, type AppStateStatus } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Check accountability-app/.env',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

type AuthLifecycleSubscription = {
  remove: () => void;
};

type AuthLifecycleGlobal = typeof globalThis & {
  __accountabilityAuthLifecycleSubscription?: AuthLifecycleSubscription;
};

if (Platform.OS !== 'web') {
  const lifecycleGlobal = globalThis as AuthLifecycleGlobal;
  lifecycleGlobal.__accountabilityAuthLifecycleSubscription?.remove();

  const updateAutoRefresh = (state: AppStateStatus) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  };

  updateAutoRefresh(AppState.currentState);
  lifecycleGlobal.__accountabilityAuthLifecycleSubscription =
    AppState.addEventListener('change', updateAutoRefresh);
}
