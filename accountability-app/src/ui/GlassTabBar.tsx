import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticSelect } from './haptics';

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

/**
 * Custom glassmorphic floating tab bar:
 *  - real frosted glass (BlurView + translucent plate) on every screen
 *  - genuine flex:1 distribution so the icons always fill the bar evenly
 *    (React Navigation reserved a slot for the hidden Profile route on native,
 *    which left dead space on the right and made the bar look off-centre).
 */
export function GlassTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();

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
  const barWidth = Math.min(winW - 32, 400);

  return (
    <View
      style={[
        styles.wrap,
        { width: barWidth, left: (winW - barWidth) / 2, bottom: Math.max(insets.bottom, 8) + 8 },
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.7)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.borderGrad}
      >
        <View style={styles.clip}>
          <BlurView
            intensity={Platform.select({ ios: 40, android: 55, web: 60, default: 50 })}
            tint="light"
            blurMethod="dimezisBlurViewSdk31Plus"
            blurReductionFactor={2}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.plate} />
          <LinearGradient
            colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
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
                style={styles.item}
              >
                {options.tabBarIcon?.({ focused: isFocused, color: '#475569', size: 24 })}
              </Pressable>
            );
          })}
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    height: 62,
    borderRadius: 31,
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  // gradient border frame (1.5px) around the frosted pill
  borderGrad: { flex: 1, borderRadius: 31, padding: 1.5 },
  clip: {
    flex: 1,
    borderRadius: 29.5,
    overflow: 'hidden',
  },
  // translucent plate so the frosted content behind stays legible under the icons
  plate: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
});
