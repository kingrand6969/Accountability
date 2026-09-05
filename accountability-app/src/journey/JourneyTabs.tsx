import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { font, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

export type JourneySection = 'momentum' | 'progress' | 'path' | 'journal';

const TABS: { key: JourneySection; label: string; route: '/activity' | '/journey-progress' | '/journey-path' | '/today' }[] = [
  { key: 'momentum', label: 'Momentum', route: '/activity' },
  { key: 'progress', label: 'Progress', route: '/journey-progress' },
  { key: 'path', label: 'Path', route: '/journey-path' },
  { key: 'journal', label: 'Journal', route: '/today' },
];

export function JourneyTabs({
  active,
}: {
  active: JourneySection;
}) {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.row} accessibilityRole="tablist">
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
                selected && styles.labelSelected,
              ]}
            >
              {visualLabel}
            </Text>
            {selected ? (
              <View style={styles.indicator} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  row: {
    minHeight: 48,
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border.subtle,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pressed: { opacity: 0.68 },
  label: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 12.5 },
  labelSelected: { color: theme.ink.primary, fontFamily: font.bold },
  indicator: {
    position: 'absolute',
    bottom: -1,
    width: 38,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.ink.action,
  },
});
