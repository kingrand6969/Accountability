import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/**
 * A mission / challenge icon (Batch 8A pack). Renders the delivered artwork
 * EXACTLY and layers a restrained premium motion over it:
 *   · a soft aura pulse behind the object
 *   · a brief "sheen" pass — a white-tinted copy of the same artwork fading in
 *     and out (shape-exact, so it reads as light crossing the metal)
 * All motion is opacity-only (native driver) and stops when `animated` is false
 * or the OS asks for reduced motion. A deterministic per-icon delay staggers a
 * row/grid so they never pulse in unison.
 *
 * Deliberately lighter than <MedalIcon/> and with its own feel, so mission
 * icons never read as medal tiers.
 *
 *   <MissionIcon source={art} size={44} />
 *   <MissionIcon source={art} size={40} animated={false} />
 */
export function MissionIcon({
  source,
  size = 44,
  animated = true,
  reducedMotion,
  glow = 'rgba(37,99,235,0.35)',
  style,
}: {
  source: ImageSourcePropType;
  size?: number;
  animated?: boolean;
  reducedMotion?: boolean;
  /** aura colour behind the object */
  glow?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [sysReduce, setSysReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => live && setSysReduce(!!v));
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) =>
      setSysReduce(!!v),
    );
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);

  const move = animated && !reducedMotion && !sysReduce;

  const sheen = useRef(new Animated.Value(0)).current;
  const aura = useRef(new Animated.Value(0)).current;

  // deterministic stagger from the source (require() returns a number on native,
  // an object on web) — hash whatever we get so grids never sync up.
  const seed = useRef(
    [...String((source as { uri?: string })?.uri ?? source ?? '')].reduce(
      (a, c) => a + c.charCodeAt(0),
      0,
    ) % 1300,
  ).current;

  useEffect(() => {
    if (!move) {
      sheen.stopAnimation();
      aura.stopAnimation();
      sheen.setValue(0);
      aura.setValue(0);
      return;
    }
    // sheen: a quick bright pass with a long idle pause (≈6s cycle)
    const sheenLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sheen, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sheen, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(4200),
      ]),
    );
    // aura: a slow gentle breathing behind the object
    const auraLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(aura, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(aura, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const t = setTimeout(() => {
      sheenLoop.start();
      auraLoop.start();
    }, seed);
    return () => {
      clearTimeout(t);
      sheenLoop.stop();
      auraLoop.stop();
    };
  }, [move, seed, sheen, aura]);

  const auraStyle = {
    position: 'absolute' as const,
    left: size * 0.12,
    top: size * 0.12,
    width: size * 0.76,
    height: size * 0.76,
    borderRadius: size * 0.38,
    backgroundColor: glow,
    opacity: aura.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }),
    transform: [{ scale: aura.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.14] }) }],
  };

  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      {/* soft aura behind */}
      <Animated.View style={auraStyle} pointerEvents="none" />
      {/* the artwork, untouched */}
      <Animated.Image
        source={source}
        style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}
        resizeMode="contain"
        fadeDuration={0}
      />
      {/* sheen: a white copy of the same shape fading in/out */}
      <Animated.Image
        source={source}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          tintColor: '#ffffff',
          opacity: sheen.interpolate({ inputRange: [0, 1], outputRange: [0, 0.42] }),
        }}
        resizeMode="contain"
        fadeDuration={0}
      />
    </Animated.View>
  );
}
