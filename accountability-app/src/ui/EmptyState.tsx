import { useMemo, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import { font, spacing, type AppThemeColors } from './theme';
import { useAppTheme } from './AppThemeProvider';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Friendly empty state: icon + title + subtitle + optional action. */
export function EmptyState({
  icon,
  title,
  subtitle,
  actionTitle,
  onAction,
}: {
  icon: IoniconName;
  title: string;
  subtitle?: string;
  actionTitle?: string;
  onAction?: () => void;
}) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={30} color={theme.ink.muted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      {actionTitle && onAction ? (
        <Button title={actionTitle} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  wrap: { alignItems: 'center', padding: spacing.xxl, gap: 6 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.surface.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { fontSize: 17, fontFamily: font.bold, color: theme.ink.primary },
  sub: {
    color: theme.ink.muted,
    fontFamily: font.regular,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  action: { marginTop: spacing.md, minWidth: 180 },
});
