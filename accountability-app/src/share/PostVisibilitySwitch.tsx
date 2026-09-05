import { useMemo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { postVisibilityCopy } from '../progress/visibility';
import { font, radius, spacing, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

export function PostVisibilitySwitch({
  showPublicly,
  onChange,
  disabled = false,
}: {
  showPublicly: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const copy = postVisibilityCopy(showPublicly);

  return (
    <View testID="post-visibility-switch-target" style={styles.row}>
      <View style={styles.copy}>
        <Text testID="buddy-card-switch-label" style={styles.title}>{copy.label}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.helper}>{copy.helper}</Text>
      </View>
      <View testID="buddy-card-switch-target" style={styles.target}>
        <Switch
          testID="buddy-card-visibility-switch"
          accessibilityRole="switch"
          accessibilityLabel={copy.accessibilityLabel}
          accessibilityHint={copy.helper}
          accessibilityState={{ checked: showPublicly, disabled }}
          value={showPublicly}
          onValueChange={onChange}
          disabled={disabled}
          hitSlop={{ top: 9, right: 6, bottom: 9, left: 6 }}
          trackColor={{ false: theme.border.strong, true: theme.ink.action }}
        />
      </View>
    </View>
  );
}

function createStyles(theme: AppThemeColors) {
  return StyleSheet.create({
    row: {
      minHeight: 72,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: radius.md,
      backgroundColor: theme.surface.muted,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    copy: { flex: 1, gap: 3, minWidth: 0 },
    title: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 15 },
    helper: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 12.5, lineHeight: 18 },
    target: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  });
}
