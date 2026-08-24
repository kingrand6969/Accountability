export type OpenMapRunLayoutInput = {
  width: number;
  height: number;
  fontScale: number;
  safeTop: number;
  safeBottom: number;
};

export type OpenMapRunLayout = {
  gutter: number;
  contentWidth: number;
  controlSize: number;
  metricFontSize: number;
  metricLineHeight: number;
  metricGap: number;
  statusTop: number;
  statusHeight: number;
  metricBandTop: number;
  secondaryRailBottom: number;
  ctaTop: number;
  ctaHeight: number;
  bottomDockBottom: number;
  largeText: boolean;
};

export type OpenMapRunVerticalLayout = {
  supported: boolean;
  extraLargeText: boolean;
  compactExtraLargeText: boolean;
  topControlSafeFloor: number;
  statusTop: number;
  statusHeight: number;
  metricBandTop: number;
  primaryMetricsHeight: number;
  secondaryTop: number;
  secondaryHeight: number;
  mapToolsTop: number;
  mapToolsHeight: number;
  mapToolsDirection: 'row' | 'column';
  heroMaxFontSizeMultiplier: number;
};

/** Expects finite positive portrait dimensions and realistic nonnegative safe-area/font-scale values. */
export function openMapRunLayout({
  width,
  height,
  fontScale,
  safeTop,
  safeBottom,
}: OpenMapRunLayoutInput): OpenMapRunLayout {
  const compact = width < 360;
  const largeText = fontScale >= 1.3;
  const extraLargeText = fontScale >= 1.75;
  const gutter = compact ? 16 : 24;
  const contentWidth = Math.min(width - gutter * 2, 560);
  const controlSize = 48;

  const baseMetricFontSize = compact ? 48 : 54;
  const metricFontSize = extraLargeText
    ? baseMetricFontSize - 12
    : largeText
      ? baseMetricFontSize - 4
      : baseMetricFontSize;
  const metricLineHeight = metricFontSize + 6;
  const metricGap = compact || largeText ? 16 : 24;

  const statusHeight = extraLargeText ? 64 : largeText ? 56 : 48;
  const ctaHeight = largeText ? 64 : 58;
  const bottomDockBottom = Math.max(safeBottom, 12) + 16;
  const ctaTop = height - bottomDockBottom - ctaHeight;
  const secondaryRailBottom = ctaTop - 14;

  const metricBandTail = (compact ? 76 : 84) + (largeText ? 8 : 0);
  const preferredMetricBandTop = secondaryRailBottom - metricLineHeight - metricBandTail;
  const preferredStatusTop = preferredMetricBandTop - statusHeight - 12;
  const statusTop = Math.max(preferredStatusTop, safeTop + 8 + controlSize);
  const metricBandTop = Math.max(preferredMetricBandTop, statusTop + statusHeight + 12);

  return {
    gutter,
    contentWidth,
    controlSize,
    metricFontSize,
    metricLineHeight,
    metricGap,
    statusTop,
    statusHeight,
    metricBandTop,
    secondaryRailBottom,
    ctaTop,
    ctaHeight,
    bottomDockBottom,
    largeText,
  };
}

/**
 * Computes the final vertical landmarks used by Open Map chrome.
 *
 * The full approved composition is supported only when it can preserve all
 * four fixed separations without moving either safe-area controls or the
 * lower action dock: 16 points after the top controls, 18 points from map
 * tools to status, 12 points from status to hero metrics, and 8 points from
 * hero metrics to the secondary rail. Unsupported inputs must use the
 * component's constrained fallback instead of clamping these landmarks into
 * one another.
 */
export function openMapRunVerticalLayout(
  input: OpenMapRunLayoutInput,
): OpenMapRunVerticalLayout {
  const layout = openMapRunLayout(input);
  const extraLargeText = input.fontScale >= 1.75;
  const compactExtraLargeText = input.width < 360 && extraLargeText;
  const statusDetailLines = extraLargeText ? 2 : 1;
  const statusHeight = Math.max(
    layout.statusHeight,
    Math.ceil(
      extraLargeText
        ? 10 + (15 + 13 * statusDetailLines) * input.fontScale
        : 14 + (17 + 15 * statusDetailLines) * input.fontScale,
    ),
  );
  const secondaryHeight = Math.max(
    44,
    Math.ceil((extraLargeText ? 18 + 11 : 20 + 12) * input.fontScale),
  );
  const secondaryTop = layout.secondaryRailBottom - secondaryHeight;
  const heroMaxFontSizeMultiplier = extraLargeText ? 1 : 1.2;
  const fittedHeroScale = Math.min(
    input.fontScale,
    heroMaxFontSizeMultiplier,
  );
  const primaryMetricsHeight = Math.ceil(
    layout.metricLineHeight * fittedHeroScale + 2 + 14 * input.fontScale,
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
  const mapToolsTop = statusTop - mapToolsHeight - 18;
  const topControlSafeFloor = input.safeTop + 8 + layout.controlSize + 16;

  return {
    supported: mapToolsTop >= topControlSafeFloor,
    extraLargeText,
    compactExtraLargeText,
    topControlSafeFloor,
    statusTop,
    statusHeight,
    metricBandTop,
    primaryMetricsHeight,
    secondaryTop,
    secondaryHeight,
    mapToolsTop,
    mapToolsHeight,
    mapToolsDirection: compactExtraLargeText ? 'row' : 'column',
    heroMaxFontSizeMultiplier,
  };
}

export function isOpenMapRunLayoutSupported(input: OpenMapRunLayoutInput): boolean {
  return openMapRunVerticalLayout(input).supported;
}
