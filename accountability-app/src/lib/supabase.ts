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

type AuthLifecycleRegistration = {
  client: typeof supabase;
  subscription: AuthLifecycleSubscription;
  stopAutoRefresh: () => void;
};

type AuthLifecycleGlobal = typeof globalThis & {
  __accountabilityAuthLifecycle?: AuthLifecycleRegistration;
  __accountabilityAuthLifecycleSubscription?: AuthLifecycleSubscription;
};

const lifecycleGlobal = globalThis as AuthLifecycleGlobal;

// Clean up the subscription shape used by earlier Fast Refresh evaluations.
lifecycleGlobal.__accountabilityAuthLifecycleSubscription?.remove();
lifecycleGlobal.__accountabilityAuthLifecycleSubscription = undefined;

const previousLifecycle = lifecycleGlobal.__accountabilityAuthLifecycle;
previousLifecycle?.subscription.remove();
if (
  previousLifecycle &&
  (previousLifecycle.client !== supabase || Platform.OS === 'web')
) {
  previousLifecycle.stopAutoRefresh();
}
lifecycleGlobal.__accountabilityAuthLifecycle = undefined;

if (Platform.OS !== 'web') {
  const updateAutoRefresh = (state: AppStateStatus) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  };

  updateAutoRefresh(AppState.currentState);
  lifecycleGlobal.__accountabilityAuthLifecycle = {
    client: supabase,
    subscription: AppState.addEventListener('change', updateAutoRefresh),
    stopAutoRefresh: () => supabase.auth.stopAutoRefresh(),
  };
}
