import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { saveActivity, type NewActivity } from './api';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));

const mockedSupabase = supabase as unknown as {
  auth: {
    getUser: ReturnType<typeof jest.fn>;
  };
  from: ReturnType<typeof jest.fn>;
};

const activity: NewActivity = {
  type: 'run',
  distance_m: 1000,
  duration_s: 300,
  route: [],
  started_at: '2026-07-26T00:00:00.000Z',
};

describe('saveActivity authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws the genuine authentication error when the user lookup fails', async () => {
    const networkError = new Error('Network request failed');
    mockedSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: networkError,
    });

    await expect(saveActivity(activity)).rejects.toBe(networkError);
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  it('throws Not signed in when the lookup succeeds without a user', async () => {
    mockedSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(saveActivity(activity)).rejects.toThrow('Not signed in.');
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });
});

describe('Supabase React Native authentication lifecycle', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    jest.resetModules();
    jest.unmock('../lib/supabase');
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
  });

  it('configures native persistence and follows foreground state', () => {
    const startAutoRefresh = jest.fn();
    const stopAutoRefresh = jest.fn();
    const remove = jest.fn();
    const addEventListener = jest.fn<
      (
        event: string,
        listener: (state: string) => void,
      ) => { remove: typeof remove }
    >();
    let onAppStateChange: ((state: string) => void) | undefined;
    addEventListener.mockImplementation((_event, listener) => {
      onAppStateChange = listener;
      return { remove };
    });
    const auth = { startAutoRefresh, stopAutoRefresh };
    const createClient = jest.fn(() => ({ auth }));
    const processLock = jest.fn();
    const storage = {};

    jest.doMock('@supabase/supabase-js', () => ({
      createClient,
      processLock,
    }));
    jest.doMock('@react-native-async-storage/async-storage', () => storage);
    jest.doMock('react-native', () => ({
      AppState: { currentState: 'active', addEventListener },
      Platform: { OS: 'ios' },
    }));
    jest.doMock('react-native-url-polyfill/auto', () => ({}));

    jest.isolateModules(() => {
      require('../lib/supabase');
    });

    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      {
        auth: {
          storage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          lock: processLock,
        },
      },
    );
    expect(startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );

    onAppStateChange?.('background');
    expect(stopAutoRefresh).toHaveBeenCalledTimes(1);

    onAppStateChange?.('active');
    expect(startAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('does not attach native lifecycle handling on web', () => {
    const addEventListener = jest.fn();
    const auth = {
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    };
    const createClient = jest.fn(() => ({ auth }));

    jest.doMock('@supabase/supabase-js', () => ({
      createClient,
      processLock: jest.fn(),
    }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({}));
    jest.doMock('react-native', () => ({
      AppState: { currentState: 'active', addEventListener },
      Platform: { OS: 'web' },
    }));
    jest.doMock('react-native-url-polyfill/auto', () => ({}));

    jest.isolateModules(() => {
      require('../lib/supabase');
    });

    expect(addEventListener).not.toHaveBeenCalled();
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
  });
});
