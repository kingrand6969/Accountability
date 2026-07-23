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

/** A soft radial glow that fades fully to transparent at its edge — so it reads
 *  as a gentle wash of colour with NO hard circle, even with no blur behind it. */
function Sphere({
  id,
  size,
  colors: [hi, mid],
  style,
  opacity,
}: {
  id: string;
  size: number;
  colors: [string, string];
  style: ViewStyle;
  opacity: number;
}) {
  return (
    <Svg width={size} height={size} style={[{ position: 'absolute', opacity }, style]}>
      <Defs>
        <RadialGradient id={id} cx="38%" cy="32%" r="72%">
          <Stop offset="0%" stopColor={hi} stopOpacity={0.55} />
          <Stop offset="50%" stopColor={mid} stopOpacity={0.28} />
          <Stop offset="100%" stopColor={mid} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

/** Base gradient + blob field. Wrap in BlurTargetView so Android blur samples it. */
export const GlassBackdrop = forwardRef(function GlassBackdrop(
  { columnWidth = 600 }: { columnWidth?: number },
  ref: Ref<View>,
) {
  return (
    <BlurTargetView ref={ref as never} style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#EDF4FC', '#DEEAF8', '#C9DCF4']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* soft colour washes anchored to the content column — gentle glows that
          fade to nothing, so the background stays calm and premium with or
          without blur (no hard circles) */}
      <View style={[styles.blobColumn, { maxWidth: columnWidth }]} pointerEvents="none">
        <Sphere
          id="blobA"
          size={460}
          colors={['#DBEAFE', '#93C5FD']}
          style={{ top: -140, left: -160 }}
          opacity={0.85}
        />
        <Sphere
          id="blobB"
          size={380}
          colors={['#FFE4F0', '#F4BCD8']}
          style={{ top: 220, right: -150 }}
          opacity={0.7}
        />
        <Sphere
          id="blobC"
          size={520}
          colors={['#E1EEFF', '#B7D6F7']}
          style={{ top: 560, left: -190 }}
          opacity={0.6}
        />
      </View>
    </BlurTargetView>
  );
});

export function GlassCard({
  children,
  style,
  blurTarget,
  plateOpacity = 0.45,
}: {
  children: ReactNode;
  style?: ViewStyle;
  blurTarget?: React.RefObject<View | null>;
  /** 0.45 keeps ~4.5:1 ink contrast while letting the blobs glow through */
  plateOpacity?: number;
}) {
  return (
    <View style={[styles.shadowWrap, style]}>
      {/* gradient BORDER — a 1.5px light edge that catches the light top-left and
          bottom-right, the signature glass rim. Renders identically on every
          platform, so the panel reads as glass even where native blur is weak. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0.7)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.borderGrad}
      >
        {/* lower intensity = less white cast from the tint overlay (the fallback
            path in Expo Go / web), so the backdrop colour glows through — the
            actual glass effect. The white plate below guards text contrast. */}
        <BlurView
          intensity={Platform.select({ ios: 40, android: 45, web: 35, default: 45 })}
          tint="light"
          blurMethod="dimezisBlurViewSdk31Plus"
          blurReductionFactor={2}
          blurTarget={(blurTarget as never) ?? undefined}
          style={styles.blur}
        >
          {/* base plate keeps ink legible */}
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,255,255,${plateOpacity})` }]}
          />
          {/* diagonal sheen — the frosted-glass highlight */}
          <LinearGradient
            colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {children}
        </BlurView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  blobColumn: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 600,
  },
  // shadow lives here — NO overflow:hidden (would clip the iOS shadow)
  shadowWrap: {
    borderRadius: 24,
    ...(Platform.OS === 'android'
      ? {} // elevation bleeds grey through translucent children — skip on Android
      : {
          shadowColor: '#1E3A8A',
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.16,
          shadowRadius: 32,
        }),
  },
  // the gradient border is a 1.5px frame around the frosted panel
  borderGrad: { borderRadius: 24, padding: 1.5 },
  // radius + clip on the BlurView itself (clips native blur AND web backdrop-filter)
  blur: {
    borderRadius: 22.5,
    overflow: 'hidden',
  },
});
