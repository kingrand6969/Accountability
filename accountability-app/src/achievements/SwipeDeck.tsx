import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../ui/theme';
import { ACCENT } from '../compete/CompeteUI';

/**
 * A horizontal, paging deck with ‹ › arrows and tappable dots. Paging is driven
 * programmatically so it works on web (no drag), tablets, and any device where a
 * nested swipe doesn't grab the gesture — touch swipe still works where supported.
 */
export function SwipeDeck({
  count,
  renderItem,
  initialIndex = 0,
  ready = true,
  ariaUnit = 'item',
  itemLabel,
}: {
  count: number;
  renderItem: (index: number, width: number) => ReactNode;
  initialIndex?: number;
  ready?: boolean;
  ariaUnit?: string;
  itemLabel?: (index: number) => string;
}) {
  const scRef = useRef<ScrollView>(null);
  const [w, setW] = useState(0);
  const [active, setActive] = useState(initialIndex);
  const didInit = useRef(false);

  // land on the requested item once, after real data + layout are ready
  useEffect(() => {
    if (didInit.current || !ready || w <= 0) return;
    didInit.current = true;
    setActive(initialIndex);
    requestAnimationFrame(() => scRef.current?.scrollTo({ x: initialIndex * w, animated: false }));
  }, [ready, w, initialIndex]);

  function onLayout(e: LayoutChangeEvent) {
    const width = e.nativeEvent.layout.width;
    if (width > 0 && width !== w) setW(width);
  }
  function onEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (w > 0) setActive(Math.round(e.nativeEvent.contentOffset.x / w));
  }
  function goTo(i: number) {
    const idx = Math.max(0, Math.min(count - 1, i));
    setActive(idx);
    if (w > 0) scRef.current?.scrollTo({ x: idx * w, animated: true });
  }

  const atStart = active <= 0;
  const atEnd = active >= count - 1;
  const idxs = Array.from({ length: count }, (_, i) => i);

  return (
    <View onLayout={onLayout}>
      <ScrollView
        ref={scRef}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onEnd}
        scrollEventThrottle={16}
      >
        {idxs.map((i) => (
          <View key={i} style={w ? { width: w } : undefined}>
            {renderItem(i, w)}
          </View>
        ))}
      </ScrollView>

      {count > 1 ? (
        <View style={styles.controls}>
          <Pressable
            onPress={() => goTo(active - 1)}
            disabled={atStart}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Previous ${ariaUnit}`}
            style={({ pressed }) => [styles.chev, atStart && styles.chevOff, pressed && !atStart && styles.chevPressed]}
          >
            <Ionicons name="chevron-back" size={18} color={ACCENT} />
          </Pressable>

          <View style={styles.dots}>
            {idxs.map((i) => (
              <Pressable
                key={i}
                onPress={() => goTo(i)}
                hitSlop={8}
                accessibilityLabel={itemLabel ? itemLabel(i) : `Go to ${ariaUnit} ${i + 1}`}
              >
                <View style={[styles.dot, i === active && styles.dotOn]} />
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={() => goTo(active + 1)}
            disabled={atEnd}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Next ${ariaUnit}`}
            style={({ pressed }) => [styles.chev, atEnd && styles.chevOff, pressed && !atEnd && styles.chevPressed]}
          >
            <Ionicons name="chevron-forward" size={18} color={ACCENT} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  chev: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,99,235,0.12)',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  chevOff: { opacity: 0.3 },
  chevPressed: { opacity: 0.55 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center' },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(30,27,75,0.18)',
  },
  dotOn: { width: 20, backgroundColor: ACCENT },
});
