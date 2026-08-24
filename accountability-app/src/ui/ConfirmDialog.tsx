import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { useAppTheme } from './AppThemeProvider';
import { colors, font, radius, spacing, themeColors } from './theme';

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
  const { mode } = useAppTheme();
  const dark = mode === 'dark';
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
        <Pressable style={[styles.card, dark && darkStyles.card]} onPress={(e) => e.stopPropagation()}>
          <BlurView
            intensity={60}
            tint={dark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
          />
          <View style={[styles.glass, dark && darkStyles.glass]} />
          <View style={[
            styles.iconWrap,
            destructive ? styles.iconDanger : styles.iconInfo,
            dark && (destructive ? darkStyles.iconDanger : darkStyles.iconInfo),
          ]}>
            <Ionicons
              name={destructive ? 'trash-outline' : 'help-circle-outline'}
              size={22}
              color={destructive
                ? (dark ? theme.status.danger : colors.danger)
                : (dark ? theme.ink.action : colors.primary)}
            />
          </View>
          <Text style={[styles.title, dark && darkStyles.title]}>{opts?.title}</Text>
          {opts?.message ? <Text style={[styles.message, dark && darkStyles.message]}>{opts.message}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              onPress={close}
              style={({ pressed }) => [styles.btn, styles.cancel, dark && darkStyles.cancel, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.cancelText, dark && darkStyles.cancelText]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={confirm}
              style={({ pressed }) => [
                styles.btn,
                destructive ? styles.confirmDanger : styles.confirmPrimary,
                dark && (destructive ? darkStyles.confirmDanger : darkStyles.confirmPrimary),
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={opts?.confirmLabel ?? 'Confirm'}
            >
              <Text style={[
                styles.confirmText,
                destructive ? styles.confirmDangerText : styles.confirmPrimaryText,
                dark && darkStyles.confirmText,
              ]}>{opts?.confirmLabel ?? 'Confirm'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  // translucent tint over the blur keeps dark title/body text at 4.5:1
  glass: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.66)',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDanger: { backgroundColor: colors.dangerSoft },
  iconInfo: { backgroundColor: colors.primarySoft },
  title: { fontFamily: font.extrabold, fontSize: 18, color: colors.text, textAlign: 'center' },
  message: {
    fontFamily: font.regular,
    fontSize: 14.5,
    color: colors.textMuted,
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
  cancel: { backgroundColor: colors.surface },
  cancelText: { fontFamily: font.bold, fontSize: 15, color: colors.textSecondary },
  confirmDanger: { backgroundColor: colors.danger },
  confirmPrimary: { backgroundColor: colors.primary },
  confirmText: { fontFamily: font.bold, fontSize: 15 },
  confirmDangerText: { color: '#fff' },
  confirmPrimaryText: { color: colors.onPrimary },
  pressed: { opacity: 0.85 },
});

const theme = themeColors('dark');
const darkStyles = StyleSheet.create({
  card: { borderColor: theme.border.strong },
  glass: { backgroundColor: theme.surface.card },
  iconDanger: { backgroundColor: theme.status.dangerSoft },
  iconInfo: { backgroundColor: theme.surface.muted },
  title: { color: theme.ink.primary },
  message: { color: theme.ink.muted },
  cancel: { backgroundColor: theme.surface.raised },
  cancelText: { color: theme.ink.secondary },
  confirmDanger: { backgroundColor: theme.status.danger },
  confirmPrimary: { backgroundColor: theme.border.action },
  confirmText: { color: theme.ink.inverse },
});
