import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { rankConfig, RANK_ORDER } from './rankAssets';

const AR = 3; // badge artwork is 3:1 (width : height)
const SMOKE = require('../../assets/images/ranks/smoke.png'); // soft organic cloud, tinted per rank

// Fixed twinkle positions (as fractions of w×h) over the gem emblem.
const SPARK_POS: [number, number][] = [
  [0.15, 0.30], [0.205, 0.60], [0.115, 0.5], [0.25, 0.36], [0.175, 0.72],
];

/**
 * Premium animated rank badge. Renders the EXACT badge artwork untouched and
 * layers subtle, per-rank effects behind and over it: a soft rising SMOKE plume
 * that grows with the rank (a faint wisp at Rookie → a full plume at Mythical),
 * a shine sweep, twinkling motes, an optional crystal flicker, and a hover lift.
 * All motion is transform/opacity only (native-driver) and is disabled when the
 * caller or the OS asks for reduced motion.
 *
 * Web note: `className` maps to `style`; CSS pseudo-elements map to the overlay
 * Views; `:hover` maps to Pressable's hover callbacks.
 */
export function RankBadge({
  rank,
  animated = true,
  size = 34,
  style,
  reducedMotion,
  onPress,
}: {
  rank: string;
  animated?: boolean;
  /** Badge HEIGHT in px; width is 3× (keeps the artwork's aspect ratio). */
  size?: number;
  style?: StyleProp<ViewStyle>;
  reducedMotion?: boolean;
  onPress?: () => void;
}) {
  const cfg = rankConfig(rank);
  const w = size * AR;
  const h = size;

  // 0 (Rookie) … 1 (Mythical) — drives how much the smoke grows.
  const tierIndex = Math.max(0, RANK_ORDER.indexOf(rank as never));
  const lvl = tierIndex / (RANK_ORDER.length - 1);
  // Aura strength: ZERO at Rookie (a clean pill, no haze past its borders), then
  // ramps in fast so it's the intended glow by the mid ranks and holds to the top.
  const glowScale = Math.min(1, lvl * 2);

  const [sysReduce, setSysReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => alive && setSysReduce(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) =>
      setSysReduce(!!v),
    );
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  const motion = animated && !reducedMotion && !sysReduce;

  // more, bigger, taller, denser smoke as the rank climbs — none at Rookie
  const puffCount = motion ? Math.round(lvl * 5) : 0; // 0 (Rookie) → 5 (Mythical)
  const peakOp = 0.16 + lvl * 0.32; // 0.16 → 0.48
  const maxScale = 1.1 + lvl * 0.9; // 1.1 → 2.0
  const rise = h * (0.55 + lvl * 1.0); // taller plume up top
  const puffSize = h * (0.95 + lvl * 0.5); // soft cloud — bigger for higher ranks

  const [shine] = useState(() => new Animated.Value(0));
  const [flick] = useState(() => new Animated.Value(1));
  const [hover] = useState(() => new Animated.Value(0));
  const twinkles = useMemo(
    () => Array.from({ length: cfg.sparkles }, () => new Animated.Value(0)),
    [cfg.sparkles],
  );
  const puffs = useMemo(
    () => Array.from({ length: puffCount }, () => new Animated.Value(0)),
    [puffCount],
  );

  useEffect(() => {
    if (!motion) return;
    const loops: Animated.CompositeAnimation[] = [];

    // rising smoke — staggered so the plume is continuous
    puffs.forEach((p, i) => {
      loops.push(
        Animated.loop(
          Animated.sequence([
            Animated.delay((i * 2600) / Math.max(1, puffCount)),
            Animated.timing(p, { toValue: 1, duration: 2600 + i * 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(p, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        ),
      );
    });

    loops.push(
      Animated.loop(
        Animated.sequence([
          Animated.delay(900),
          Animated.timing(shine, { toValue: 1, duration: cfg.shineMs, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );

    if (cfg.flicker) {
      loops.push(
        Animated.loop(
          Animated.sequence([
            Animated.delay(1400),
            Animated.timing(flick, { toValue: 0.6, duration: 70, useNativeDriver: true }),
            Animated.timing(flick, { toValue: 1, duration: 110, useNativeDriver: true }),
            Animated.timing(flick, { toValue: 0.78, duration: 60, useNativeDriver: true }),
            Animated.timing(flick, { toValue: 1, duration: 150, useNativeDriver: true }),
          ]),
        ),
      );
    }

    twinkles.forEach((tw, i) => {
      loops.push(
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 380),
            Animated.timing(tw, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(tw, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.delay(1000),
          ]),
        ),
      );
    });

    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [motion, cfg, shine, flick, twinkles, puffs, puffCount]);

  const hoverScale = motion ? hover.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] }) : 1;

  // shine sweep — clipped to the plate
  const clipL = w * 0.16, clipT = h * 0.2;
  const clipW = w * 0.71, clipH = h * 0.48;
  const shineX = shine.interpolate({ inputRange: [0, 1], outputRange: [-clipW * 0.6, clipW * 1.0] });
  const shineY = shine.interpolate({ inputRange: [0, 1], outputRange: [clipH * 1.2, -clipH * 1.2] });

  return (
    <Animated.View style={[{ transform: [{ scale: hoverScale }] }, style]}>
      <Pressable
        onPress={onPress}
        onHoverIn={motion ? () => Animated.timing(hover, { toValue: 1, duration: 160, useNativeDriver: true }).start() : undefined}
        onHoverOut={motion ? () => Animated.timing(hover, { toValue: 0, duration: 220, useNativeDriver: true }).start() : undefined}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : 'image'}
        accessibilityLabel={`Rank: ${rank}`}
        style={{ width: w, height: h }}
      >
        {/* faint static base aura — a soft tinted cloud behind the badge.
            Skipped entirely at Rookie so the pill stays clean to its edges. */}
        {glowScale > 0 ? (
          <Animated.Image
            source={SMOKE}
            style={{
              position: 'absolute',
              left: w * 0.1, top: -h * 0.35,
              width: w * 0.8, height: h * 1.7,
              tintColor: cfg.glow,
              opacity: cfg.glowMax * 0.5 * glowScale,
            }}
          />
        ) : null}

        {/* rising smoke plume (behind the badge; grows with rank) */}
        {puffs.map((p, i) => {
          const x = puffCount === 1 ? w * 0.5 : w * (0.26 + 0.48 * (i / (puffCount - 1)));
          const drift = (i % 2 === 0 ? 1 : -1) * w * 0.04 * (0.5 + lvl);
          const spin = (i % 2 === 0 ? 1 : -1) * (24 + i * 8);
          return (
            <Animated.Image
              key={`smoke-${i}`}
              source={SMOKE}
              style={{
                position: 'absolute',
                left: x - puffSize / 2,
                top: h * 0.42 - puffSize / 2,
                width: puffSize, height: puffSize,
                tintColor: cfg.glow,
                opacity: p.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, peakOp, 0] }),
                transform: [
                  { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
                  { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [h * 0.1, -rise] }) },
                  { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.45, maxScale] }) },
                  { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spin}deg`] }) },
                ],
              }}
            />
          );
        })}

        {/* the exact badge artwork — never altered */}
        <Animated.Image
          source={cfg.image}
          resizeMode="contain"
          style={[StyleSheet.absoluteFill, { width: w, height: h, opacity: cfg.flicker ? flick : 1 }]}
        />

        {/* shine sweep, clipped to the plate */}
        {motion ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: clipL, top: clipT, width: clipW, height: clipH, borderRadius: clipH / 2, overflow: 'hidden' }}
          >
            <Animated.View
              style={{
                position: 'absolute', top: -clipH, left: 0, height: clipH * 3,
                transform: [
                  { translateX: cfg.shineDir === 'up' ? 0 : shineX },
                  { translateY: cfg.shineDir === 'up' ? shineY : 0 },
                  { rotate: '18deg' },
                ],
              }}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0)', `rgba(255,255,255,${cfg.shineBright})`, 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: clipW * 0.55, height: clipH * 3 }}
              />
            </Animated.View>
          </View>
        ) : null}

        {/* twinkling motes over the gem emblem */}
        {motion
          ? twinkles.map((tw, i) => (
              <Animated.View
                key={`tw-${i}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: w * SPARK_POS[i][0],
                  top: h * SPARK_POS[i][1],
                  opacity: tw,
                  transform: [{ scale: tw.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }],
                }}
              >
                <View
                  style={{
                    width: size * 0.15, height: size * 0.15, borderRadius: size * 0.08,
                    backgroundColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.9,
                    shadowRadius: size * 0.14, shadowOffset: { width: 0, height: 0 },
                    ...(Platform.OS === 'android' ? { elevation: 3 } : null),
                  }}
                />
              </Animated.View>
            ))
          : null}
      </Pressable>
    </Animated.View>
  );
}
