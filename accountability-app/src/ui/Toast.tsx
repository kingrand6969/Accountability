import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, font, radius, spacing } from './theme';

let pushToast: ((msg: string) => void) | null = null;

/** Non-blocking success feedback (auto-dismisses). Use instead of Alert for
 *  confirmations — alerts are for errors and destructive confirms only. */
export function showToast(message: string): void {
  pushToast?.(message);
}

/** Mount once near the root (root _layout). */
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pushToast = (m: string) => {
      setMsg(m);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
          () => setMsg(null),
        );
      }, 2600);
    };
    return () => {
      pushToast = null;
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [opacity]);

  if (!msg) return null;
  return (
    <Animated.View style={[styles.wrap, { opacity }]} pointerEvents="none">
      <View style={styles.toast} accessibilityLiveRegion="polite">
        <Ionicons name="checkmark-circle" size={18} color="#4ade80" />
        <Text style={styles.text}>{msg}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    alignItems: 'center',
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.text,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    maxWidth: '86%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  text: { color: '#fff', fontFamily: font.semibold, fontSize: 14.5, flexShrink: 1 },
});
