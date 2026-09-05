import { useState, type ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ActivityType } from './api';
import {
  openMapRunLayout,
  openMapRunVerticalLayout,
} from './runTrackerLayout';
import { colors, font, radius, themeColors } from '../ui/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type RunTrackerPrimaryAction = {
  label: string;
  compactLabel?: string;
  icon: IoniconName;
  tone: 'primary' | 'danger';
  disabled: boolean;
  busy: boolean;
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
  secondaryAction?: RunTrackerPrimaryAction;
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
  secondaryAction,
  primaryAction,
  viewportWidth,
  viewportHeight,
  fontScale,
  safeTop,
  safeBottom,
  sideInset,
}: RunTrackerOpenMapProps) {
  const [constrainedMapControlsOpen, setConstrainedMapControlsOpen] = useState(false);
  const layoutInput = {
    width: viewportWidth,
    height: viewportHeight,
    fontScale,
    safeTop,
    safeBottom,
  };
  const layout = openMapRunLayout(layoutInput);
  const vertical = openMapRunVerticalLayout(layoutInput);
  const constrained = !vertical.supported;
  const constrainedControlsExpanded = constrained && constrainedMapControlsOpen;
  const naturalLeft = (viewportWidth - layout.contentWidth) / 2;
  const contentLeft = Math.max(sideInset, naturalLeft);
  const contentWidth = Math.max(
    0,
    Math.min(layout.contentWidth, viewportWidth - contentLeft * 2),
  );
  const topControlTop = safeTop + 8;
  const extraLargeText = vertical.extraLargeText;
  const compactLargeTextTabs = viewportWidth < 360 && fontScale >= 1.3;
  const activityTabsNeedFullWidth = extraLargeText || compactLargeTextTabs;
  const safeTabsLeft = contentLeft + layout.controlSize;
  const safeTabsWidth = viewportWidth - safeTabsLeft * 2;
  const tabWidth = extraLargeText
    ? safeTabsWidth / ACTIVITIES.length
    : viewportWidth < 360
      ? 48
      : 56;
  const tabsLeft = extraLargeText
    ? safeTabsLeft
    : (viewportWidth - tabWidth * ACTIVITIES.length) / 2;
  const primaryColumnWidth = Math.max(
    0,
    (contentWidth - layout.metricGap) / 2,
  );
  const statusHeight = vertical.statusHeight;
  const secondaryHeight = vertical.secondaryHeight;
  const secondaryTop = vertical.secondaryTop;
  const primaryMetricsHeight = vertical.primaryMetricsHeight;
  const statusTop = constrained
    ? vertical.topControlSafeFloor
    : vertical.statusTop;
  const metricBandTop = constrained
    ? statusTop + statusHeight + 12
    : vertical.metricBandTop;
  const mapToolGap = 10;
  const mapToolsHeight = vertical.mapToolsHeight;
  const mapToolsTop = vertical.mapToolsTop;
  const constrainedActionGap = 8;
  const actionWidth = constrained
    ? contentWidth - layout.controlSize - constrainedActionGap
    : contentWidth;
  const actionRailGap = secondaryAction ? 10 : 0;
  const secondaryActionWidth = secondaryAction
    ? Math.max(48, Math.floor((actionWidth - actionRailGap) / 2))
    : 0;
  const primaryActionWidth = secondaryAction
    ? Math.max(48, actionWidth - actionRailGap - secondaryActionWidth)
    : actionWidth;
  const primaryActionLeft = secondaryAction
    ? contentLeft + secondaryActionWidth + actionRailGap
    : contentLeft;
  const paceSpoken = isUnavailablePace(pace)
    ? 'Pace unavailable'
    : `Pace ${pace} per kilometre`;

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
              activityTabsNeedFullWidth && styles.activityTabNoHorizontalPadding,
              pressed && !activitySelectorDisabled && styles.tabPressed,
              activitySelectorDisabled && styles.disabled,
            ]}
          >
            <Text
              numberOfLines={1}
              testID={`run-activity-label-${activity.value}`}
              style={[
                styles.activityLabel,
                extraLargeText && styles.activityLabelExtraLargeText,
                selected && styles.activityLabelSelected,
              ]}
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

      {!constrained ? (
        <View
          pointerEvents="box-none"
          testID="run-open-map-map-tools"
          style={[
            styles.mapTools,
            {
              right: contentLeft,
              top: mapToolsTop,
              height: mapToolsHeight,
              flexDirection: vertical.mapToolsDirection,
              gap: mapToolGap,
            },
          ]}
        >
          <MapControlButtons
            controlSize={layout.controlSize}
            routeOverviewAvailable={routeOverviewAvailable}
            onCenterMap={onCenterMap}
            onShowRoute={onShowRoute}
          />
        </View>
      ) : null}

      <View
        pointerEvents="none"
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
          testID="run-open-map-status-chip"
          style={[
            styles.status,
            extraLargeText && styles.statusExtraLargeText,
            { maxWidth: contentWidth },
          ]}
        >
          <View accessibilityElementsHidden style={styles.statusDot} />
          <View accessible={false} style={styles.statusCopy}>
            <Text
              accessible={false}
              testID="run-status-title"
              style={[
                styles.statusTitle,
                extraLargeText && styles.statusTitleExtraLargeText,
              ]}
            >
              {statusTitle}
            </Text>
            <Text
              accessible={false}
              testID="run-status-detail"
              style={[
                styles.statusDetail,
                extraLargeText && styles.statusDetailExtraLargeText,
              ]}
            >
              {statusDetail}
            </Text>
          </View>
        </View>
      </View>

      <View
        pointerEvents="none"
        testID="run-open-map-primary-metrics"
        style={[
          styles.primaryMetrics,
          {
            left: contentLeft,
            top: metricBandTop,
            width: contentWidth,
            minHeight: primaryMetricsHeight,
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
            maxFontSizeMultiplier={vertical.heroMaxFontSizeMultiplier}
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
            maxFontSizeMultiplier={vertical.heroMaxFontSizeMultiplier}
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

      {!constrainedControlsExpanded ? (
        <>
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            testID="run-open-map-divider"
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
            pointerEvents="none"
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
            <Text
              accessible={false}
              testID="run-secondary-value-pace"
              style={[
                styles.secondaryValue,
                extraLargeText && styles.secondaryValueExtraLargeText,
              ]}
            >
              {pace}
            </Text>
            <Text
              accessible={false}
              testID="run-secondary-label-pace"
              style={[
                styles.secondaryLabel,
                extraLargeText && styles.secondaryLabelExtraLargeText,
              ]}
            >
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
              style={[
                styles.secondaryValue,
                extraLargeText && styles.secondaryValueExtraLargeText,
              ]}
            >
              {estimatedCalories}
            </Text>
            <Text
              accessible={false}
              testID="run-secondary-label-calories"
              style={[
                styles.secondaryLabel,
                extraLargeText && styles.secondaryLabelExtraLargeText,
              ]}
            >
              EST. CAL
            </Text>
          </View>
        </View>
          </View>
        </>
      ) : null}

      {constrained ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Map controls"
          accessibilityHint="Show location and route map controls"
          accessibilityState={{ expanded: constrainedMapControlsOpen }}
          onPress={() => setConstrainedMapControlsOpen((open) => !open)}
          testID="run-open-map-controls-trigger"
          style={({ pressed }) => [
            styles.roundControl,
            {
              right: contentLeft,
              top: layout.ctaTop + (layout.ctaHeight - layout.controlSize) / 2,
              width: layout.controlSize,
              height: layout.controlSize,
            },
            pressed && styles.controlPressed,
          ]}
        >
          <Ionicons name="map-outline" size={21} color={colors.primary} />
        </Pressable>
      ) : null}

      {constrainedControlsExpanded ? (
        <View
          pointerEvents="box-none"
          testID="run-open-map-constrained-map-tools"
          style={[
            styles.constrainedMapTools,
            {
              left: contentLeft,
              top: secondaryTop,
              width: contentWidth,
              height: secondaryHeight,
              gap: mapToolGap,
            },
          ]}
        >
          <MapControlButtons
            controlSize={layout.controlSize}
            routeOverviewAvailable={routeOverviewAvailable}
            onCenterMap={onCenterMap}
            onShowRoute={onShowRoute}
            testIDPrefix="run-open-map-constrained"
          />
        </View>
      ) : null}

      {secondaryAction ? (
        <RunTrackerActionButton
          action={secondaryAction}
          slot="secondary"
          left={contentLeft}
          top={layout.ctaTop}
          width={secondaryActionWidth}
          minHeight={layout.ctaHeight}
          constrained={constrained}
          extraLargeText={fontScale >= 1.75}
          dual
        />
      ) : null}

      <RunTrackerActionButton
        action={primaryAction}
        slot="primary"
        left={primaryActionLeft}
        top={layout.ctaTop}
        width={primaryActionWidth}
        minHeight={layout.ctaHeight}
        constrained={constrained}
        extraLargeText={fontScale >= 1.75}
        dual={Boolean(secondaryAction)}
      />
    </View>
  );
}

function RunTrackerActionButton({
  action,
  slot,
  left,
  top,
  width,
  minHeight,
  constrained,
  extraLargeText,
  dual,
}: {
  action: RunTrackerPrimaryAction;
  slot: 'primary' | 'secondary';
  left: number;
  top: number;
  width: number;
  minHeight: number;
  constrained: boolean;
  extraLargeText: boolean;
  dual: boolean;
}) {
  const danger = action.tone === 'danger';
  const outlinedSecondary = slot === 'secondary' && !danger;
  const visibleLabel = dual && extraLargeText && action.compactLabel
    ? action.compactLabel
    : action.label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ busy: action.busy, disabled: action.disabled }}
      disabled={action.disabled}
      onPress={action.onPress}
      testID={`run-${slot}-action-${action.tone}`}
      style={({ pressed }) => [
        styles.primaryAction,
        danger ? styles.actionDanger : styles.actionPrimary,
        outlinedSecondary && styles.actionSecondary,
        {
          left,
          top,
          width,
          minHeight,
        },
        dual && styles.actionDual,
        extraLargeText && styles.primaryActionExtraLargeText,
        dual && extraLargeText && styles.actionDualExtraLargeText,
        action.disabled && styles.disabled,
        pressed && !action.disabled && styles.actionPressed,
      ]}
    >
      <Ionicons
        name={action.icon}
        size={20}
        color={danger ? colors.text : outlinedSecondary ? colors.primary : colors.onPrimary}
      />
      <Text
        testID={`run-${slot}-action-label`}
        style={[
          styles.actionLabel,
          constrained && styles.actionLabelConstrained,
          danger && styles.actionLabelDanger,
          outlinedSecondary && styles.actionLabelSecondary,
        ]}
      >
        {visibleLabel}
      </Text>
    </Pressable>
  );
}

function MapControlButtons({
  controlSize,
  routeOverviewAvailable,
  onCenterMap,
  onShowRoute,
  testIDPrefix,
}: {
  controlSize: number;
  routeOverviewAvailable: boolean;
  onCenterMap: () => void;
  onShowRoute: () => void;
  testIDPrefix?: string;
}) {
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Center map on my location"
        accessibilityHint="Move the map to your latest location"
        onPress={onCenterMap}
        testID={testIDPrefix ? `${testIDPrefix}-center` : undefined}
        style={({ pressed }) => [
          styles.roundControl,
          styles.mapControl,
          { width: controlSize, height: controlSize },
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
        testID={testIDPrefix ? `${testIDPrefix}-route` : undefined}
        style={({ pressed }) => [
          styles.roundControl,
          styles.mapControl,
          { width: controlSize, height: controlSize },
          !routeOverviewAvailable && styles.disabled,
          pressed && routeOverviewAvailable && styles.controlPressed,
        ]}
      >
        <Ionicons name="scan-outline" size={20} color={palette.ink.primary} />
      </Pressable>
    </>
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
  activityTabNoHorizontalPadding: { paddingHorizontal: 0 },
  activityLabel: {
    color: palette.ink.muted,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
  },
  activityLabelSelected: { color: colors.primary, fontFamily: font.semibold },
  activityLabelExtraLargeText: { fontSize: 12, lineHeight: 16 },
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
  mapControl: { position: 'relative' },
  constrainedMapTools: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  statusRegion: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border.strong,
    backgroundColor: 'rgba(11,13,11,0.78)',
  },
  statusExtraLargeText: { paddingVertical: 5 },
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
  statusTitleExtraLargeText: { fontSize: 12, lineHeight: 15 },
  statusDetail: {
    color: palette.ink.muted,
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  statusDetailExtraLargeText: { fontSize: 10, lineHeight: 13 },
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
  secondaryValueExtraLargeText: { fontSize: 14, lineHeight: 18 },
  secondaryLabel: {
    color: palette.ink.muted,
    fontFamily: font.medium,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.8,
  },
  secondaryLabelExtraLargeText: { fontSize: 8, lineHeight: 11 },
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
  actionSecondary: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(11,13,11,0.88)',
  },
  actionDual: {
    gap: 7,
    paddingHorizontal: 12,
  },
  actionDualExtraLargeText: {
    flexDirection: 'column',
    gap: 0,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  actionPressed: { opacity: 0.82 },
  actionLabel: {
    flexShrink: 1,
    color: colors.onPrimary,
    fontFamily: font.bold,
    fontSize: 16,
    lineHeight: 21,
    textAlign: 'center',
  },
  actionLabelConstrained: { fontSize: 14, lineHeight: 19 },
  actionLabelDanger: { color: colors.text },
  actionLabelSecondary: { color: colors.primary },
});
