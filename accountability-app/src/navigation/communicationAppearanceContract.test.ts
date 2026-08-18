import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('communication surfaces appearance contract', () => {
  test('Messages derives every communication surface and state from the active semantic theme', () => {
    const messages = source('src/app/(app)/messages.tsx');

    expect(messages).toContain('const { colors: theme } = useAppTheme();');
    expect(messages).toContain('const styles = useMemo(() => createStyles(theme), [theme]);');
    expect(messages).toContain('placeholderTextColor={theme.ink.muted}');
    expect(messages).toContain('tintColor={theme.ink.action}');
    expect(messages).toContain('colors={[theme.ink.action]}');
    expect(messages).toContain('progressBackgroundColor={theme.surface.card}');
    expect(messages).toContain('backgroundColor: theme.surface.canvas');
    expect(messages).toContain('backgroundColor: theme.interaction.skeleton');
    expect(messages).toContain('backgroundColor: theme.ink.action');
    expect(messages).toContain('backgroundColor: theme.status.success');
    expect(messages).toContain('color: theme.ink.inverse');
    expect(messages).not.toContain("const ONLINE = '#22c55e'");
    expect(messages).not.toContain('const styles = StyleSheet.create({');
  });

  test('Notifications themes loading, refresh, unread rows, copy, and badges without changing routing', () => {
    const notifications = source('src/app/(app)/notifications.tsx');

    expect(notifications).toContain('const { colors: theme, mode } = useAppTheme();');
    expect(notifications).toContain('const styles = useMemo(() => createStyles(theme), [theme]);');
    expect(notifications).toContain('<ActivityIndicator color={theme.ink.action}');
    expect(notifications).toContain('tintColor={theme.ink.action}');
    expect(notifications).toContain('colors={[theme.ink.action]}');
    expect(notifications).toContain('progressBackgroundColor={theme.surface.card}');
    expect(notifications).toContain('backgroundColor: theme.surface.canvas');
    expect(notifications).toContain('rowUnread: { backgroundColor: theme.surface.muted }');
    expect(notifications).toContain('borderColor: theme.surface.canvas');
    expect(notifications).toContain('color: theme.ink.primary');
    expect(notifications).toContain('color: theme.ink.muted');
    expect(notifications).toContain('backgroundColor: theme.ink.action');
    expect(notifications).toContain('notificationBadge(item.type, theme, mode)');
    expect(notifications).toContain('background: theme.status.attention');
    expect(notifications).toContain("foreground: mode === 'dark' ? theme.ink.inverse : theme.ink.primary");
    expect(notifications).toContain('background: theme.status.success');
    expect(notifications).toContain('foreground: theme.surface.canvas');
    expect(notifications).toContain("router.push({ pathname: '/post/[id]'");
    expect(notifications).not.toContain('const styles = StyleSheet.create({');
  });

  test('shared communication empty states remain readable in either appearance', () => {
    const emptyState = source('src/ui/EmptyState.tsx');

    expect(emptyState).toContain('const { colors: theme } = useAppTheme();');
    expect(emptyState).toContain('const styles = useMemo(() => createStyles(theme), [theme]);');
    expect(emptyState).toContain('color={theme.ink.muted}');
    expect(emptyState).toContain('backgroundColor: theme.surface.muted');
    expect(emptyState).toContain('color: theme.ink.primary');
    expect(emptyState).toContain('color: theme.ink.muted');
    expect(emptyState).not.toContain('const styles = StyleSheet.create({');
  });
});
