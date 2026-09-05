import { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { radius, spacing, type, type AppThemeColors } from './theme';
import { useAppTheme } from './AppThemeProvider';

export type NavigationOption<Value extends string = string> = {
  value: Value;
  label: string;
  disabled?: boolean;
  accessibilityLabel?: string;
};

type NavigationControlProps<Value extends string> = {
  accessibilityLabel: string;
  value: Value;
  onChange: (value: Value) => void;
  style?: StyleProp<ViewStyle>;
};

type SegmentedControlProps<Value extends string> =
  NavigationControlProps<Value> & {
    options: readonly NavigationOption<Value>[];
  };

export function SegmentedControl<Value extends string>({
  accessibilityLabel,
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<Value>) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.segmentedTrack, style]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const disabled = option.disabled ?? false;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && !disabled && styles.pressed,
              disabled && styles.disabled,
              styles.touchTarget,
            ]}
          >
            <Text
              style={[
                styles.segmentLabel,
                selected && styles.segmentLabelSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type QuietTopTabsProps<Value extends string> =
  NavigationControlProps<Value> & {
    tabs: readonly NavigationOption<Value>[];
  };

export function QuietTopTabs<Value extends string>({
  accessibilityLabel,
  tabs,
  value,
  onChange,
  style,
}: QuietTopTabsProps<Value>) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.quietTabs, style]}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        const disabled = tab.disabled ?? false;
        return (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityLabel={tab.accessibilityLabel ?? tab.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(tab.value)}
            style={({ pressed }) => [
              styles.quietTab,
              pressed && !disabled && styles.pressed,
              disabled && styles.disabled,
              styles.touchTarget,
            ]}
          >
            <Text
              style={[
                styles.quietTabLabel,
                selected && styles.quietTabLabelSelected,
              ]}
            >
              {tab.label}
            </Text>
            {selected ? (
              <View
                testID={`quiet-tab-indicator-${tab.value}`}
                style={styles.quietIndicator}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  segmentedTrack: {
    flexDirection: 'row',
    borderColor: theme.border.subtle,
    borderWidth: 1,
    borderRadius: radius.pill,
    padding: 2,
    backgroundColor: theme.surface.card,
  },
  segment: {
    flex: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: theme.ink.action,
  },
  segmentLabel: {
    ...type.label,
    color: theme.ink.secondary,
    textAlign: 'center',
    flexShrink: 1,
  },
  segmentLabelSelected: {
    color: theme.ink.inverse,
  },
  quietTabs: {
    flexDirection: 'row',
    backgroundColor: theme.surface.card,
  },
  quietTab: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietTabLabel: {
    ...type.label,
    color: theme.ink.muted,
    textAlign: 'center',
    flexShrink: 1,
  },
  quietTabLabelSelected: {
    color: theme.ink.primary,
  },
  quietIndicator: {
    width: 28,
    height: 2,
    marginTop: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: theme.ink.action,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.48,
  },
  touchTarget: {
    minHeight: spacing.touch,
    minWidth: spacing.touch,
  },
});
