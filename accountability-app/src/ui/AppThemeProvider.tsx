import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { Appearance, Platform } from 'react-native';

import {
  resolveAppThemeMode,
  themeColors,
  type AppThemeColors,
  type AppThemeMode,
} from './theme';

export const APP_THEME_STORAGE_KEY = 'appearance:mode:v1';

type ThemeStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

function getThemeStorage(): ThemeStorage | null {
  try {
    // This stays lazy so a missing native module cannot turn startup black.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storageModule = require('@react-native-async-storage/async-storage') as {
      default?: ThemeStorage;
      getItem?: ThemeStorage['getItem'];
      setItem?: ThemeStorage['setItem'];
    };
    const storage = storageModule.default ?? storageModule;
    return typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
      ? (storage as ThemeStorage)
      : null;
  } catch {
    return null;
  }
}

type AppThemeContextValue = {
  mode: AppThemeMode;
  colors: AppThemeColors;
  setMode: (mode: AppThemeMode) => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function syncNativeColorScheme(mode: AppThemeMode) {
  if (Platform.OS === 'web') return;
  const setter = (Appearance as typeof Appearance & {
    setColorScheme?: (scheme: AppThemeMode) => void;
  }).setColorScheme;
  if (typeof setter === 'function') setter.call(Appearance, mode);
}

/**
 * Manual appearance preference. It intentionally renders Light immediately,
 * then hydrates in the background so theme storage can never block startup.
 */
export function AppThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<AppThemeMode>('light');
  const selectionRevision = useRef(0);

  useEffect(() => {
    syncNativeColorScheme(mode);
  }, [mode]);

  useEffect(() => {
    let active = true;
    const hydrationRevision = selectionRevision.current;
    const storage = getThemeStorage();
    if (!storage) return undefined;

    storage.getItem(APP_THEME_STORAGE_KEY)
      .then((storedMode) => {
        if (!active || selectionRevision.current !== hydrationRevision) return;
        setModeState(resolveAppThemeMode(storedMode));
      })
      .catch(() => {
        // Light is already rendered; storage availability never blocks the app.
      });

    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((nextMode: AppThemeMode) => {
    const approvedMode = resolveAppThemeMode(nextMode);
    selectionRevision.current += 1;
    setModeState(approvedMode);
    getThemeStorage()?.setItem(APP_THEME_STORAGE_KEY, approvedMode).catch(() => {
      // Keep the user's active selection even if this device cannot persist it.
    });
  }, []);

  const value = useMemo<AppThemeContextValue>(
    () => ({ mode, colors: themeColors(mode), setMode }),
    [mode, setMode],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const value = useContext(AppThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider.');
  return value;
}
