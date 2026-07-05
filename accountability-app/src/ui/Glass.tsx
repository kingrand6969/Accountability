import { forwardRef, type ReactNode, type Ref } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { BlurView, BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/**
 * Real glassmorphism needs saturated shapes BEHIND the glass — blurring a flat
 * gradient is invisible. GlassBackdrop paints a quiet base gradient plus soft
 * 3D "spheres" that cross the glass panels' edges; GlassCard is the frosted
 * panel itself (radius+clip+border on the BlurView, shadow on the wrapper,
 * white plate for text contrast — per platform quirks).
 */

function Sphere({
  id,
  size,
  colors: [hi, mid, lo],
  style,
  opacity,
}: {
  id: string;
  size: number;
  colors: [string, string, string];
  style: ViewStyle;
  opacity: number;
}) {
  return (
    <Svg width={size} height={size} style={[{ position: 'absolute', opacity }, style]}>
      <Defs>
        <RadialGradient id={id} cx="32%" cy="28%" r="78%">
          <Stop offset="0%" stopColor={hi} />
          <Stop offset="55%" stopColor={mid} />
          <Stop offset="100%" stopColor={lo} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

/** Base gradient + blob field. Wrap in BlurTargetView so Android blur samples it. */
export const GlassBackdrop = forwardRef(function GlassBackdrop(
  _props: object,
  ref: Ref<View>,
) {
  return (
    <BlurTargetView ref={ref as never} style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#F1EDFB', '#E4DCF7', '#D6C9F0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Sphere
          id="blobA"
          size={300}
          colors={['#E4D5FF', '#A78BFA', '#7C5CD9']}
          style={{ top: -50, left: -90 }}
          opacity={0.9}
        />
        <Sphere
          id="blobB"
          size={230}
          colors={['#FFD3E6', '#F49AC6', '#D96FA8']}
          style={{ top: 170, right: -70 }}
          opacity={0.75}
        />
        <Sphere
          id="blobC"
          size={360}
          colors={['#D3E6FF', '#8EC5FF', '#5E9BE6']}
          style={{ top: 430, left: -130 }}
          opacity={0.65}
        />
        <Sphere
          id="blobD"
          size={130}
          colors={['#FFE9C4', '#FFC96B', '#E8A93F']}
          style={{ top: 330, right: 48 }}
          opacity={0.55}
        />
        {/* crisp accents — blur shows best on hard edges */}
        <View style={styles.ring} />
        <View style={[styles.dot, { top: 150, left: 40 }]} />
        <View style={[styles.dot, { top: 400, right: 90 }]} />
        <View style={[styles.dot, { top: 600, left: 70 }]} />
      </View>
    </BlurTargetView>
  );
});

export function GlassCard({
  children,
  style,
  blurTarget,
  plateOpacity = 0.5,
}: {
  children: ReactNode;
  style?: ViewStyle;
  blurTarget?: React.RefObject<View | null>;
  plateOpacity?: number;
}) {
  return (
    <View style={[styles.shadowWrap, style]}>
      <BlurView
        intensity={Platform.select({ ios: 45, android: 60, web: 85, default: 60 })}
        tint="light"
        blurMethod="dimezisBlurViewSdk31Plus"
        blurReductionFactor={2}
        blurTarget={(blurTarget as never) ?? undefined}
        style={styles.blur}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: `rgba(255,255,255,${plateOpacity})` },
          ]}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']}
          style={styles.bevel}
        />
        {children}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  // shadow lives here — NO overflow:hidden (would clip the iOS shadow)
  shadowWrap: {
    borderRadius: 24,
    ...(Platform.OS === 'android'
      ? {} // elevation bleeds grey through translucent children — skip on Android
      : {
          shadowColor: '#4C3B8F',
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.16,
          shadowRadius: 32,
        }),
  },
  // radius + clip + border on the BlurView itself (clips native blur AND web backdrop-filter)
  blur: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  bevel: { position: 'absolute', top: 0, left: 16, right: 16, height: 1 },
  ring: {
    position: 'absolute',
    top: 90,
    right: -30,
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
});
