import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, spacing } from '../ui/theme';
import type { BuddyCardPaletteTokens } from './palette';

export function BuddyCardFocus({
  text,
  palette,
}: {
  text: string | null | undefined;
  palette: BuddyCardPaletteTokens;
}) {
  const copy = text?.trim();
  const [expandedCopy, setExpandedCopy] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<{
    copy: string;
    truncated: boolean;
  } | null>(null);
  const expanded = !!copy && expandedCopy === copy;
  const truncated = !!copy && measurement?.copy === copy && measurement.truncated;

  useEffect(() => {
    setExpandedCopy(null);
  }, [copy]);

  if (!copy) return null;

  return (
    <View
      testID="buddy-card-focus"
      style={[styles.root, { borderBottomColor: palette.border }]}
    >
      <Text
        testID="buddy-card-focus-label"
        style={[styles.label, { color: palette.textMuted }]}
      >
        CURRENT FOCUS
      </Text>
      <Text
        testID="buddy-card-focus-measurer"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.copy, styles.measurer, { color: palette.text }]}
        onTextLayout={(event) => {
          const nextTruncated = event.nativeEvent.lines.length > 3;
          setMeasurement((current) =>
            current?.copy === copy && current.truncated === nextTruncated
              ? current
              : { copy, truncated: nextTruncated },
          );
        }}
      >
        {copy}
      </Text>
      <Text
        testID="buddy-card-focus-copy"
        style={[styles.copy, { color: palette.text }]}
        numberOfLines={expanded ? undefined : 3}
      >
        {copy}
      </Text>
      {truncated || expanded ? (
        <Pressable
          onPress={() => setExpandedCopy(expanded ? null : copy)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse current focus' : 'View full current focus'}
          accessibilityState={{ expanded }}
          style={styles.action}
        >
          <Text style={[styles.actionText, { color: palette.accent }]}>
            {expanded ? 'Show less' : 'View full focus'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontFamily: font.extrabold,
    fontSize: 10,
    letterSpacing: 1.3,
    marginBottom: 6,
  },
  copy: {
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 21,
  },
  measurer: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0,
  },
  action: {
    minHeight: 48,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: font.bold,
    fontSize: 12.5,
  },
});
