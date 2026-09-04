import type { ReactNode } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from './BrandMark';
import { CrownDockRunAction } from './CrownDockRunAction';
import {
  TAB_BAR_MIN_CONTENT_HEIGHT,
  tabBarContentHeight,
} from './floatingTabBar';
import { useAppTheme } from './AppThemeProvider';
import { hapticSelect } from './haptics';
import { spacing, type } from './theme';

// Minimal shape of the props Expo Router's <Tabs tabBar={...}> passes — avoids a
// direct dependency on @react-navigation/bottom-tabs' (nested) type declarations.
type IconRender = (p: { focused: boolean; color: string; size: number }) => ReactNode;
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<
    string,
    { options: { title?: string; tabBarStyle?: unknown; tabBarIcon?: IconRender } }
  >;
  navigation: {
    emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
  onMenu: () => void;
};

export const VISIBLE_TAB_LABELS = [
  'Feed',
  'Journey',
  'Run',
  'Messages',
  'Menu',
] as const;

const visibleTabLabels = new Set<string>(VISIBLE_TAB_LABELS);
const compactTabLabels: Record<(typeof VISIBLE_TAB_LABELS)[number], string> = {
  Feed: 'Home',
  Journey: 'Path',
  Run: 'Run',
  Messages: 'Chat',
  Menu: 'Menu',
};

/** Quiet five-destination bottom navigation matching the approved references. */
export function GlassTabBar({ state, descriptors, navigation, onMenu }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const fontScale = PixelRatio.getFontScale();
  const contentHeight = tabBarContentHeight(fontScale);

  // immersive screens (e.g. an active run) hide the bar via tabBarStyle:{display:'none'}
  const focusedKey = state.routes[state.index].key;
  const focusedStyle = descriptors[focusedKey]?.options.tabBarStyle;
  if (
    focusedStyle &&
    !Array.isArray(focusedStyle) &&
    (focusedStyle as { display?: string }).display === 'none'
  ) {
    return null;
  }

  const items = state.routes.filter((route) => {
    const options = descriptors[route.key]?.options;
    return (
      options?.tabBarIcon != null &&
      visibleTabLabels.has(options.title ?? route.name)
    );
  });
  return (
    <View
      style={[
        styles.wrap,
        {
          minHeight: contentHeight + Math.max(insets.bottom, 4),
          paddingBottom: Math.max(insets.bottom, 4),
          backgroundColor: theme.surface.raised,
          borderTopColor: theme.border.subtle,
        },
      ]}
    >
      <View
        testID="primary-tab-list"
        accessibilityRole="tablist"
        style={[styles.row, { height: contentHeight }]}
      >
          {items.map((route) => {
            const { options } = descriptors[route.key];
            const isFocused = route.key === focusedKey;
            const accessibleLabel = options.title ?? route.name;
            const isRun = accessibleLabel === 'Run';
            const visualLabel =
              fontScale >= 1.25 && visibleTabLabels.has(accessibleLabel)
                ? compactTabLabels[accessibleLabel as (typeof VISIBLE_TAB_LABELS)[number]]
                : accessibleLabel;
            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                hapticSelect();
                navigation.navigate(route.name);
              }
            };
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="tab"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={accessibleLabel}
                style={({ pressed }) => [
                  styles.item,
                  isRun && styles.runItem,
                  pressed && styles.pressed,
                ]}
              >
                {isRun ? (
                  <CrownDockRunAction focused={isFocused} />
                ) : (options.title ?? route.name) === 'Journey' ? (
                  <BrandMark
                    size={27}
                    color={isFocused ? theme.ink.action : theme.ink.muted}
                    accessible={false}
                  />
                ) : (
                  options.tabBarIcon?.({
                    focused: isFocused,
                    color: isFocused ? theme.ink.action : theme.ink.muted,
                    size: 24,
                  })
                )}
                {!isRun ? (
                  <Text
                    testID={`tab-label-${accessibleLabel}`}
                    style={[
                      styles.label,
                      { color: theme.ink.muted },
                      isFocused && { color: theme.ink.action },
                    ]}
                    numberOfLines={2}
                  >
                    {visualLabel}
                  </Text>
                ) : null}
                {isFocused && !isRun ? (
                  <View
                    testID={`tab-indicator-${options.title ?? route.name}`}
                    style={{
                      ...styles.indicator,
                      backgroundColor: theme.ink.action,
                    }}
                  />
                ) : null}
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => {
              hapticSelect();
              onMenu();
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: false }}
            accessibilityLabel="Menu"
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <Ionicons name="menu-outline" size={24} color={theme.ink.action} />
            <Text
              testID="tab-label-Menu"
              style={[styles.label, { color: theme.ink.muted }]}
              numberOfLines={2}
            >
              {fontScale >= 1.25 ? compactTabLabels.Menu : 'Menu'}
            </Text>
          </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 68,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'visible',
  },
  row: {
    minHeight: TAB_BAR_MIN_CONTENT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingTop: 6,
    paddingBottom: 8,
    overflow: 'visible',
  },
  item: {
    flex: 1,
    minHeight: spacing.touch,
    minWidth: spacing.touch,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 2,
  },
  runItem: {
    overflow: 'visible',
    zIndex: 4,
    elevation: 14,
  },
  pressed: { opacity: 0.72 },
  label: {
    ...type.caption,
    lineHeight: 16,
    textAlign: 'center',
    flexShrink: 1,
  },
  indicator: {
    position: 'absolute',
    bottom: 3,
    width: 18,
    height: 2,
    borderRadius: 1,
  },
});
