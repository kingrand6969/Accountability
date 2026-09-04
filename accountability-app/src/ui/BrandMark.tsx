import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import {
  BRAND_GEOMETRY,
  BRAND_LOCKUP_MARK_ASPECT_RATIO,
  BRAND_LOCKUP_MARK_RENDER_VIEW_BOX,
  BRAND_WORDMARK,
} from './brandGeometry';

type BrandMarkProps = {
  size?: number;
  color?: string;
  accessibilityLabel?: string;
  accessible?: boolean;
};

/**
 * Mantle: two people moving through one shared rhythm.
 */
export function BrandMark({
  size = 28,
  color = BRAND_GEOMETRY.colors.lime,
  accessibilityLabel = `${BRAND_WORDMARK} logo`,
  accessible = true,
}: BrandMarkProps) {
  return (
    <View
      style={{ width: size, aspectRatio: BRAND_LOCKUP_MARK_ASPECT_RATIO }}
      accessible={accessible}
      importantForAccessibility={accessible ? 'yes' : 'no-hide-descendants'}
      accessibilityRole={accessible ? 'image' : undefined}
      accessibilityLabel={accessible ? accessibilityLabel : undefined}
      accessibilityElementsHidden={!accessible}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={BRAND_LOCKUP_MARK_RENDER_VIEW_BOX}
        preserveAspectRatio="xMidYMid meet"
        accessible={false}
      >
        {BRAND_GEOMETRY.mark.paths.map((path) => (
          <Path
            key={path}
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={BRAND_GEOMETRY.mark.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
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
    </View>
  );
}
