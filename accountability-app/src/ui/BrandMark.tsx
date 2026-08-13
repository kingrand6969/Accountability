import Svg, { Path } from 'react-native-svg';

import { BRAND_GEOMETRY, BRAND_WORDMARK } from './brandGeometry';

type BrandMarkProps = {
  size?: number;
  color?: string;
  accessibilityLabel?: string;
};

/**
 * Accountability's Unbroken A: strength outside, rising motivation within.
 */
export function BrandMark({
  size = 28,
  color = BRAND_GEOMETRY.colors.cobalt,
  accessibilityLabel = BRAND_WORDMARK,
}: BrandMarkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={BRAND_GEOMETRY.viewBox}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Path d={BRAND_GEOMETRY.mark.primaryPath} fill={color} />
      <Path
        d={BRAND_GEOMETRY.mark.accentPath}
        fill={
          color === BRAND_GEOMETRY.colors.cobalt
            ? BRAND_GEOMETRY.colors.cyan
            : color
        }
      />
    </Svg>
  );
}
