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
