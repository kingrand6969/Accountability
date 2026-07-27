import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticSelect } from './haptics';
import { colors, font } from './theme';

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
};

/** Labeled, fixed bottom navigation matching the approved mobile feed reference. */
export function GlassTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

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

  // only routes that declare an icon (the hidden Profile route has none)
  const items = state.routes.filter((r) => descriptors[r.key].options.tabBarIcon != null);
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 4) }]}>
      <View style={styles.row}>
          {items.map((route) => {
            const { options } = descriptors[route.key];
            const isFocused = route.key === focusedKey;
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
                accessibilityRole="button"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={options.title ?? route.name}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              >
                {options.tabBarIcon?.({ focused: isFocused, color: colors.textMuted, size: 24 })}
                <Text style={[styles.label, isFocused && styles.labelActive]} numberOfLines={1}>
                  {options.title ?? route.name}
                </Text>
              </Pressable>
            );
          })}
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
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'stretch' },
  item: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 3 },
  pressed: { backgroundColor: colors.primarySoft },
  label: { color: colors.textMuted, fontFamily: font.medium, fontSize: 10.5 },
  labelActive: { color: colors.primary, fontFamily: font.semibold },
});
