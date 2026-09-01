import Svg, { Circle, Path } from 'react-native-svg';

import { BRAND_GEOMETRY, BRAND_WORDMARK } from './brandGeometry';

type BrandMarkProps = {
  size?: number;
  color?: string;
  accessibilityLabel?: string;
};

/**
 * Mantle: two people moving through one shared rhythm.
 */
export function BrandMark({
  size = 28,
  color = BRAND_GEOMETRY.colors.lime,
  accessibilityLabel = `${BRAND_WORDMARK} logo`,
}: BrandMarkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={BRAND_GEOMETRY.viewBox}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Path
        d={BRAND_GEOMETRY.mark.path}
        fill="none"
        stroke={color}
        strokeWidth={BRAND_GEOMETRY.mark.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {BRAND_GEOMETRY.mark.nodes.map((node) => (
        <Circle
          key={`${node.cx}-${node.cy}`}
          cx={node.cx}
          cy={node.cy}
          r={node.r}
          fill={color}
        />
      ))}
    </Svg>
  );
}
