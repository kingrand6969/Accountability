import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, font } from '../ui/theme';

export type JourneySection = 'momentum' | 'path' | 'journal';

const TABS: { key: JourneySection; label: string; route: '/activity' | '/journey-path' | '/today' }[] = [
  { key: 'momentum', label: 'Momentum', route: '/activity' },
  { key: 'path', label: 'Path', route: '/journey-path' },
  { key: 'journal', label: 'Journal', route: '/today' },
];

export function JourneyTabs({
  active,
  dark = false,
}: {
  active: JourneySection;
  dark?: boolean;
}) {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  return (
    <View style={[styles.row, dark && styles.rowDark]} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const selected = active === tab.key;
        const visualLabel =
          fontScale >= 1.25 && tab.key === 'momentum' ? 'Now' : tab.label;
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              if (!selected) router.replace(tab.route as never);
            }}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${tab.label} journey tab`}
          >
            <Text
              style={[
                styles.label,
                dark && styles.labelDark,
                selected && styles.labelSelected,
                selected && dark && styles.labelSelectedDark,
              ]}
            >
              {visualLabel}
            </Text>
            {selected ? (
              <View style={[styles.indicator, dark && styles.indicatorDark]} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(8,26,58,0.14)',
  },
  rowDark: { borderBottomColor: 'rgba(255,255,255,0.16)' },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pressed: { opacity: 0.68 },
  label: { color: colors.inkSoft, fontFamily: font.medium, fontSize: 12.5 },
  labelDark: { color: 'rgba(255,255,255,0.68)' },
  labelSelected: { color: colors.navy, fontFamily: font.bold },
  labelSelectedDark: { color: '#FFFFFF' },
  indicator: {
    position: 'absolute',
    bottom: -1,
    width: 38,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.navy,
  },
  indicatorDark: { backgroundColor: '#FFFFFF' },
});
