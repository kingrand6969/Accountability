import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { useAppTheme } from './AppThemeProvider';
import { font, radius, spacing, type AppThemeColors } from './theme';

type Options = {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

let present: ((opts: Options) => void) | null = null;

/** Branded, in-app confirmation dialog (works the same on phone, tablet, web). */
export function confirmDialog(opts: Options): void {
  if (present) present(opts);
  else opts.onConfirm(); // host not mounted — don't block the action
}

/** Mount once near the root (root _layout). */
export function ConfirmHost() {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [opts, setOpts] = useState<Options | null>(null);

  useEffect(() => {
    present = setOpts;
    return () => {
      present = null;
    };
  }, []);

  function close() {
    setOpts(null);
  }
  function confirm() {
    const cb = opts?.onConfirm;
    close();
    cb?.();
  }

  const destructive = opts?.destructive ?? true;

  return (
    <Modal visible={!!opts} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <BlurView
            intensity={60}
            tint="dark"
            style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
          />
          <View style={styles.glass} />
          <View style={[
            styles.iconWrap,
            destructive ? styles.iconDanger : styles.iconInfo,
          ]}>
            <Ionicons
              name={destructive ? 'trash-outline' : 'help-circle-outline'}
              size={22}
              color={destructive ? theme.status.danger : theme.ink.action}
            />
          </View>
          <Text style={styles.title}>{opts?.title}</Text>
          {opts?.message ? <Text style={styles.message}>{opts.message}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              onPress={close}
              style={({ pressed }) => [styles.btn, styles.cancel, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={confirm}
              style={({ pressed }) => [
                styles.btn,
                destructive ? styles.confirmDanger : styles.confirmPrimary,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={opts?.confirmLabel ?? 'Confirm'}
            >
              <Text style={[
                styles.confirmText,
                destructive ? styles.confirmDangerText : styles.confirmPrimaryText,
              ]}>{opts?.confirmLabel ?? 'Confirm'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.interaction.scrim,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border.strong,
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  // dark plate over the blur keeps title and body text readable
  glass: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.surface.card,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDanger: { backgroundColor: theme.status.dangerSoft },
  iconInfo: { backgroundColor: theme.surface.muted },
  title: { fontFamily: font.extrabold, fontSize: 18, color: theme.ink.primary, textAlign: 'center' },
  message: {
    fontFamily: font.regular,
    fontSize: 14.5,
    color: theme.ink.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, alignSelf: 'stretch' },
  btn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { backgroundColor: theme.surface.raised },
  cancelText: { fontFamily: font.bold, fontSize: 15, color: theme.ink.secondary },
  confirmDanger: { backgroundColor: theme.status.danger },
  confirmPrimary: { backgroundColor: theme.ink.action },
  confirmText: { fontFamily: font.bold, fontSize: 15 },
  confirmDangerText: { color: theme.ink.inverse },
  confirmPrimaryText: { color: theme.ink.inverse },
  pressed: { opacity: 0.85 },
});
