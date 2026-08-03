import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  colors,
  radius,
  semanticColors,
  spacing,
  type,
} from './theme';

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

const styles = StyleSheet.create({
  segmentedTrack: {
    flexDirection: 'row',
    borderColor: semanticColors.border.action,
    borderWidth: 1,
    borderRadius: radius.pill,
    padding: 2,
    backgroundColor: semanticColors.surface.card,
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
    backgroundColor: colors.primary,
  },
  segmentLabel: {
    ...type.label,
    color: semanticColors.ink.action,
    textAlign: 'center',
    flexShrink: 1,
  },
  segmentLabelSelected: {
    color: semanticColors.ink.inverse,
  },
  quietTabs: {
    flexDirection: 'row',
    backgroundColor: semanticColors.surface.card,
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
    color: semanticColors.ink.muted,
    textAlign: 'center',
    flexShrink: 1,
  },
  quietTabLabelSelected: {
    color: semanticColors.ink.primary,
  },
  quietIndicator: {
    width: 28,
    height: 2,
    marginTop: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
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
