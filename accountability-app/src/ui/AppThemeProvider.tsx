import {
  createContext,
  useContext,
  useEffect,
  type PropsWithChildren,
} from 'react';
import { Appearance, Platform } from 'react-native';

import {
  themeColors,
  type AppThemeColors,
  type AppThemeMode,
} from './theme';

type AppThemeContextValue = {
  mode: AppThemeMode;
  colors: AppThemeColors;
  setMode: (mode: AppThemeMode) => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

const darkMode: AppThemeMode = 'dark';
const darkColors = themeColors(darkMode);
const ignoreModeSelection = (_mode: AppThemeMode) => {};
const darkThemeValue: AppThemeContextValue = {
  mode: darkMode,
  colors: darkColors,
  setMode: ignoreModeSelection,
};

function syncNativeColorScheme(mode: AppThemeMode) {
  if (Platform.OS === 'web') return;
  const setter = (Appearance as typeof Appearance & {
    setColorScheme?: (scheme: AppThemeMode) => void;
  }).setColorScheme;
  if (typeof setter === 'function') setter.call(Appearance, mode);
}

/**
 * Permanent dark appearance. The compatibility setter intentionally ignores
 * requests while downstream callers migrate away from manual theme controls.
 */
export function AppThemeProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    syncNativeColorScheme(darkMode);
  }, []);

  return <AppThemeContext.Provider value={darkThemeValue}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const value = useContext(AppThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider.');
  return value;
}
