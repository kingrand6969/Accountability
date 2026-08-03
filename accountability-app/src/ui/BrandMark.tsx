import Svg, { Circle, Path } from 'react-native-svg';

import { BRAND_GEOMETRY, BRAND_WORDMARK } from './brandGeometry';

type BrandMarkProps = {
  size?: number;
  color?: string;
  accessibilityLabel?: string;
};

/**
 * AccountAbility's ribbon-people mark.
 *
 * The two figures lean together to make the approved A/M silhouette. Keep the
 * open centre and asymmetric overlap: they are what distinguish this mark from
 * a generic people icon.
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
      {BRAND_GEOMETRY.heads.map((head) => (
        <Circle
          key={`${head.cx}-${head.cy}`}
          cx={head.cx}
          cy={head.cy}
          r={head.r}
          fill={color}
        />
      ))}
      {BRAND_GEOMETRY.ribbons.map((ribbon) => (
        <Path key={ribbon} d={ribbon} fill={color} />
      ))}
    </Svg>
  );
}
