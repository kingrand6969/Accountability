import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ActivityType } from './api';
import { openMapRunLayout } from './runTrackerLayout';
import { colors, font, radius, themeColors } from '../ui/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type RunTrackerPrimaryAction = {
  label: string;
  icon: IoniconName;
  tone: 'primary' | 'danger';
  disabled: boolean;
  onPress: () => void;
};

export type RunTrackerOpenMapProps = {
  selectedActivity: ActivityType;
  activitySelectorDisabled: boolean;
  onSelectActivity: (activity: ActivityType) => void;
  onBack: () => void;
  onMore: () => void;
  onCenterMap: () => void;
  onShowRoute: () => void;
  routeOverviewAvailable: boolean;
  statusTitle: string;
  statusDetail: string;
  distance: string;
  elapsed: string;
  pace: string;
  estimatedCalories: number;
  primaryAction: RunTrackerPrimaryAction;
  viewportWidth: number;
  viewportHeight: number;
  fontScale: number;
  safeTop: number;
  safeBottom: number;
  sideInset: number;
};

const palette = themeColors('dark');
const ACTIVITIES: readonly { value: ActivityType; label: string }[] = [
  { value: 'run', label: 'Run' },
  { value: 'walk', label: 'Walk' },
  { value: 'ride', label: 'Ride' },
];

export function RunTrackerOpenMap({
  selectedActivity,
  activitySelectorDisabled,
  onSelectActivity,
  onBack,
  onMore,
  onCenterMap,
  onShowRoute,
  routeOverviewAvailable,
  statusTitle,
  statusDetail,
  distance,
  elapsed,
  pace,
  estimatedCalories,
  primaryAction,
  viewportWidth,
  viewportHeight,
  fontScale,
  safeTop,
  safeBottom,
  sideInset,
}: RunTrackerOpenMapProps) {
  const layout = openMapRunLayout({
    width: viewportWidth,
    height: viewportHeight,
    fontScale,
    safeTop,
    safeBottom,
  });
  const naturalLeft = (viewportWidth - layout.contentWidth) / 2;
  const contentLeft = Math.max(sideInset, naturalLeft);
  const contentWidth = Math.max(
    0,
    Math.min(layout.contentWidth, viewportWidth - contentLeft * 2),
  );
  const topControlTop = safeTop + 8;
  const tabWidth = viewportWidth < 360 ? 48 : 56;
  const tabsLeft = (viewportWidth - tabWidth * ACTIVITIES.length) / 2;
  const primaryColumnWidth = Math.max(
    0,
    (contentWidth - layout.metricGap) / 2,
  );
  const compactExtraLargeText = viewportWidth < 360 && fontScale >= 1.75;
  const statusDetailLines = compactExtraLargeText ? 2 : 1;
  const statusHeight = Math.max(
    layout.statusHeight,
    Math.ceil(14 + (17 + 15 * statusDetailLines) * fontScale),
  );
  const secondaryHeight = Math.max(44, Math.ceil((20 + 12) * fontScale));
  const secondaryTop = layout.secondaryRailBottom - secondaryHeight;
  const fittedHeroScale = Math.min(fontScale, 1.2);
  const primaryMetricsHeight = Math.ceil(
    layout.metricLineHeight * fittedHeroScale + 2 + 14 * fontScale,
  );
  const metricBandTop = Math.min(
    layout.metricBandTop,
    secondaryTop - primaryMetricsHeight - 8,
  );
  const statusTop = Math.min(
    layout.statusTop,
    metricBandTop - statusHeight - 12,
  );
  const mapToolGap = 10;
  const mapToolsHeight = compactExtraLargeText
    ? layout.controlSize
    : layout.controlSize * 2 + mapToolGap;
  const mapToolsTop = Math.max(
    topControlTop + layout.controlSize + 16,
    statusTop - mapToolsHeight - 18,
  );
  const paceSpoken = isUnavailablePace(pace)
    ? 'Pace unavailable'
    : `Pace ${pace} per kilometre`;
  const actionBusy = primaryAction.label.trim().toLowerCase().startsWith('starting');

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="run-open-map-chrome">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        accessibilityHint="Return to the previous screen"
        onPress={onBack}
        style={({ pressed }) => [
          styles.roundControl,
          {
            left: contentLeft,
            top: topControlTop,
            width: layout.controlSize,
            height: layout.controlSize,
          },
          pressed && styles.controlPressed,
        ]}
      >
        <Ionicons name="chevron-back" size={23} color={palette.ink.primary} />
      </Pressable>

      {ACTIVITIES.map((activity, index) => {
        const selected = selectedActivity === activity.value;
        return (
          <Pressable
            key={activity.value}
            accessibilityRole="tab"
            accessibilityLabel={activity.label}
            accessibilityState={{ disabled: activitySelectorDisabled, selected }}
            disabled={activitySelectorDisabled}
            onPress={() => onSelectActivity(activity.value)}
            style={({ pressed }) => [
              styles.activityTab,
              {
                left: tabsLeft + tabWidth * index,
                top: topControlTop,
                width: tabWidth,
                height: layout.controlSize,
              },
              pressed && !activitySelectorDisabled && styles.tabPressed,
              activitySelectorDisabled && styles.disabled,
            ]}
          >
            <Text
              testID={`run-activity-label-${activity.value}`}
              style={[styles.activityLabel, selected && styles.activityLabelSelected]}
            >
              {activity.label}
            </Text>
            {selected ? <View accessibilityElementsHidden style={styles.selectedUnderline} /> : null}
          </Pressable>
        );
      })}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More options"
        accessibilityHint="Open Run tracker options"
        onPress={onMore}
        style={({ pressed }) => [
          styles.roundControl,
          {
            right: contentLeft,
            top: topControlTop,
            width: layout.controlSize,
            height: layout.controlSize,
          },
          pressed && styles.controlPressed,
        ]}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={palette.ink.primary} />
      </Pressable>

      <View
        pointerEvents="box-none"
        testID="run-open-map-map-tools"
        style={[
          styles.mapTools,
          {
            right: contentLeft,
            top: mapToolsTop,
            height: mapToolsHeight,
            flexDirection: compactExtraLargeText ? 'row' : 'column',
            gap: mapToolGap,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Center map on my location"
          accessibilityHint="Move the map to your latest location"
          onPress={onCenterMap}
          style={({ pressed }) => [
            styles.roundControl,
            { width: layout.controlSize, height: layout.controlSize },
            pressed && styles.controlPressed,
          ]}
        >
          <Ionicons name="locate" size={21} color={colors.primary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show complete route"
          accessibilityHint={
            routeOverviewAvailable
              ? 'Fit the complete recorded route on the map'
              : 'Route overview is unavailable until enough points are recorded'
          }
          accessibilityState={{ disabled: !routeOverviewAvailable }}
          disabled={!routeOverviewAvailable}
          onPress={onShowRoute}
          style={({ pressed }) => [
            styles.roundControl,
            { width: layout.controlSize, height: layout.controlSize },
            !routeOverviewAvailable && styles.disabled,
            pressed && routeOverviewAvailable && styles.controlPressed,
          ]}
        >
          <Ionicons name="scan-outline" size={20} color={palette.ink.primary} />
        </Pressable>
      </View>

      <View
        pointerEvents="box-none"
        testID="run-open-map-status"
        style={[
          styles.statusRegion,
          {
            left: contentLeft,
            top: statusTop,
            width: contentWidth,
            minHeight: statusHeight,
          },
        ]}
      >
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${statusTitle}. ${statusDetail}`}
          style={[styles.status, { maxWidth: contentWidth }]}
        >
          <View accessibilityElementsHidden style={styles.statusDot} />
          <View accessible={false} style={styles.statusCopy}>
            <Text accessible={false} testID="run-status-title" style={styles.statusTitle}>
              {statusTitle}
            </Text>
            <Text accessible={false} testID="run-status-detail" style={styles.statusDetail}>
              {statusDetail}
            </Text>
          </View>
        </View>
      </View>

      <View
        pointerEvents="box-none"
        testID="run-open-map-primary-metrics"
        style={[
          styles.primaryMetrics,
          {
            left: contentLeft,
            top: metricBandTop,
            width: contentWidth,
            gap: layout.metricGap,
          },
        ]}
      >
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Distance ${distance} kilometres`}
          style={{ width: primaryColumnWidth }}
        >
          <Text
            accessible={false}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            testID="run-metric-value-distance"
            style={[
              styles.primaryValue,
              { fontSize: layout.metricFontSize, lineHeight: layout.metricLineHeight },
            ]}
          >
            {distance}
            <Text accessible={false} style={styles.primaryUnit}> km</Text>
          </Text>
          <Text
            accessible={false}
            testID="run-metric-label-distance"
            style={styles.metricLabel}
          >
            DISTANCE
          </Text>
        </View>

        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Elapsed time ${elapsed}`}
          style={{ width: primaryColumnWidth }}
        >
          <Text
            accessible={false}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            testID="run-metric-value-time"
            style={[
              styles.primaryValue,
              { fontSize: layout.metricFontSize, lineHeight: layout.metricLineHeight },
            ]}
          >
            {elapsed}
          </Text>
          <Text
            accessible={false}
            testID="run-metric-label-time"
            style={styles.metricLabel}
          >
            TIME
          </Text>
        </View>
      </View>

      <View
        pointerEvents="none"
        accessibilityElementsHidden
        style={[
          styles.divider,
          {
            left: contentLeft,
            top: secondaryTop - 8,
            width: contentWidth,
          },
        ]}
      />

      <View
        pointerEvents="box-none"
        testID="run-open-map-secondary-metrics"
        style={[
          styles.secondaryMetrics,
          {
            left: contentLeft,
            top: secondaryTop,
            width: contentWidth,
            minHeight: secondaryHeight,
          },
        ]}
      >
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={paceSpoken}
          style={styles.secondaryMetric}
        >
          <Ionicons name="speedometer-outline" size={18} color={colors.primary} />
          <View accessible={false} style={styles.secondaryCopy}>
            <Text accessible={false} testID="run-secondary-value-pace" style={styles.secondaryValue}>
              {pace}
            </Text>
            <Text accessible={false} testID="run-secondary-label-pace" style={styles.secondaryLabel}>
              PACE /KM
            </Text>
          </View>
        </View>
        <View accessibilityElementsHidden pointerEvents="none" style={styles.railDivider} />
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Estimated calories ${estimatedCalories}`}
          style={styles.secondaryMetric}
        >
          <Ionicons name="flame-outline" size={18} color={colors.primary} />
          <View accessible={false} style={styles.secondaryCopy}>
            <Text
              accessible={false}
              testID="run-secondary-value-calories"
              style={styles.secondaryValue}
            >
              {estimatedCalories}
            </Text>
            <Text
              accessible={false}
              testID="run-secondary-label-calories"
              style={styles.secondaryLabel}
            >
              EST. CAL
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={primaryAction.label}
        accessibilityState={{ busy: actionBusy, disabled: primaryAction.disabled }}
        disabled={primaryAction.disabled}
        onPress={primaryAction.onPress}
        testID={`run-primary-action-${primaryAction.tone}`}
        style={({ pressed }) => [
          styles.primaryAction,
          primaryAction.tone === 'danger' ? styles.actionDanger : styles.actionPrimary,
          {
            left: contentLeft,
            top: layout.ctaTop,
            width: contentWidth,
            minHeight: layout.ctaHeight,
          },
          fontScale >= 1.75 && styles.primaryActionExtraLargeText,
          primaryAction.disabled && styles.disabled,
          pressed && !primaryAction.disabled && styles.actionPressed,
        ]}
      >
        <Ionicons
          name={primaryAction.icon}
          size={20}
          color={primaryAction.tone === 'danger' ? '#FFFFFF' : colors.onPrimary}
        />
        <Text
          testID="run-primary-action-label"
          style={[
            styles.actionLabel,
            primaryAction.tone === 'danger' && styles.actionLabelDanger,
          ]}
        >
          {primaryAction.label}
        </Text>
      </Pressable>
    </View>
  );
}

function isUnavailablePace(pace: string) {
  const normalized = pace.trim();
  return normalized === '' || normalized === '--:--' || normalized === '—';
}

const styles = StyleSheet.create({
  roundControl: {
    position: 'absolute',
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border.strong,
    backgroundColor: 'rgba(11,13,11,0.74)',
  },
  controlPressed: { backgroundColor: 'rgba(32,37,32,0.92)' },
  activityTab: {
    position: 'absolute',
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  activityLabel: {
    color: palette.ink.muted,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
  },
  activityLabelSelected: { color: colors.primary, fontFamily: font.semibold },
  selectedUnderline: {
    position: 'absolute',
    bottom: 4,
    width: 26,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  tabPressed: { opacity: 0.7 },
  disabled: { opacity: palette.interaction.disabledOpacity },
  mapTools: { position: 'absolute' },
  statusRegion: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border.strong,
    backgroundColor: 'rgba(11,13,11,0.78)',
  },
  statusDot: {
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  statusCopy: { flexShrink: 1 },
  statusTitle: {
    color: palette.ink.primary,
    fontFamily: font.semibold,
    fontSize: 13,
    lineHeight: 17,
  },
  statusDetail: {
    color: palette.ink.muted,
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  primaryMetrics: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  primaryValue: {
    color: palette.ink.primary,
    fontFamily: font.regular,
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  primaryUnit: {
    color: palette.ink.secondary,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0,
  },
  metricLabel: {
    marginTop: 2,
    color: palette.ink.muted,
    fontFamily: font.semibold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.4,
  },
  divider: {
    position: 'absolute',
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border.strong,
  },
  secondaryMetrics: {
    position: 'absolute',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  secondaryMetric: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  secondaryCopy: { flexShrink: 1 },
  secondaryValue: {
    color: palette.ink.primary,
    fontFamily: font.semibold,
    fontVariant: ['tabular-nums'],
    fontSize: 16,
    lineHeight: 20,
  },
  secondaryLabel: {
    color: palette.ink.muted,
    fontFamily: font.medium,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.8,
  },
  railDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    marginHorizontal: 16,
    backgroundColor: palette.border.strong,
  },
  primaryAction: {
    position: 'absolute',
    minWidth: 48,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  primaryActionExtraLargeText: { paddingVertical: 8 },
  actionPrimary: { backgroundColor: colors.primary },
  actionDanger: { backgroundColor: colors.danger },
  actionPressed: { opacity: 0.82 },
  actionLabel: {
    flexShrink: 1,
    color: colors.onPrimary,
    fontFamily: font.bold,
    fontSize: 16,
    lineHeight: 21,
    textAlign: 'center',
  },
  actionLabelDanger: { color: '#FFFFFF' },
});
