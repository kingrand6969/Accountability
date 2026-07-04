import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { colors, font, radius, spacing } from './theme';

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
            tint="light"
            style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
          />
          <View style={styles.glass} />
          <View style={[styles.iconWrap, destructive ? styles.iconDanger : styles.iconInfo]}>
            <Ionicons
              name={destructive ? 'trash-outline' : 'help-circle-outline'}
              size={22}
              color={destructive ? colors.danger : colors.primary}
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
              <Text style={styles.confirmText}>{opts?.confirmLabel ?? 'Confirm'}</Text>
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
  confirmText: { fontFamily: font.bold, fontSize: 15, color: '#fff' },
  pressed: { opacity: 0.85 },
});
