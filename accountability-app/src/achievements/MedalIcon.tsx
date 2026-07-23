import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  MEDAL_ART,
  MEDAL_TIER,
  medalFx,
  type MedalIconKey,
  type MedalTierIndex,
} from './medalArt';

const SMOKE = require('../../assets/images/ranks/smoke.png'); // soft cloud, tinted

// Fixed twinkle positions (fractions of the box) — upper arc around the art.
const SPARK_POS: [number, number][] = [
  [0.2, 0.22],
  [0.76, 0.34],
  [0.62, 0.12],
];

/**
 * Premium animated medal. Renders the EXACT medal artwork untouched and layers
 * subtle effects over it, tuned per metal tier (Bronze…Diamond) and per icon:
 *   · a soft pulsing halo behind the art
 *   · shape-exact "heat"/shimmer breathing (tinted copies of the artwork)
 *   · a brief shine pass (Diamond double-blinks)
 *   · tiny twinkling motes, a drifting smoke wisp (Spark), an orbiting light
 *     (500 Club)
 * All motion is transform/opacity only (native driver) and switches off when
 * `animated` is false or the OS asks for reduced motion.
 *
 * Web note: `className` maps to `style` in React Native; CSS pseudo-elements
 * map to the overlay layers below.
 *
 * Example usage:
 *   <MedalIcon icon="streak-blaze" size={92} />
 *   <MedalIcon icon="distance-500" size={64} animated={false} />
 *   <MedalIcon icon="streak-spark" size={72} tier={0} reducedMotion />
 */
export function MedalIcon({
  icon,
  size = 72,
  animated = true,
  tier,
  style,
  reducedMotion,
}: {
  icon: MedalIconKey;
  /** Square box in px; the artwork letterboxes inside untouched. */
  size?: number;
  animated?: boolean;
  /** 0 Bronze … 4 Diamond. Defaults to the icon's own metal. */
  tier?: MedalTierIndex;
  style?: StyleProp<ViewStyle>;
  /** Force-disable motion; the OS reduce-motion setting is always respected. */
  reducedMotion?: boolean;
}) {
  const fx = useMemo(() => medalFx(icon, tier ?? MEDAL_TIER[icon]), [icon, tier]);
  const art = MEDAL_ART[icon];

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

  const halo = useRef(new Animated.Value(0)).current;
  const glint = useRef(new Animated.Value(0)).current;
  const driftV = useRef(new Animated.Value(0)).current;
  const orbitV = useRef(new Animated.Value(0)).current;
  const embers = useMemo(
    () => fx.embers.map(() => new Animated.Value(0)),
    [fx.embers],
  );
  const sparks = useMemo(
    () => Array.from({ length: motion ? fx.sparkles.count : 0 }, () => new Animated.Value(0)),
    [fx.sparkles.count, motion],
  );

  // deterministic per-icon stagger so a grid of medals never pulses in unison
  const stagger = useMemo(
    () => [...icon].reduce((a, c) => a + c.charCodeAt(0), 0) % 1400,
    [icon],
  );

  useEffect(() => {
    if (!motion) return;
    const loops: Animated.CompositeAnimation[] = [];

    // halo breathing
    loops.push(
      Animated.loop(
        Animated.sequence([
          Animated.timing(halo, { toValue: 1, duration: fx.halo.ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(halo, { toValue: 0, duration: fx.halo.ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    );

    // shape-exact heat / shimmer breathing
    embers.forEach((e, i) => {
      const cfg = fx.embers[i];
      loops.push(
        Animated.loop(
          Animated.sequence([
            Animated.delay(cfg.delay ?? 0),
            Animated.timing(e, { toValue: 1, duration: cfg.ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(e, { toValue: 0, duration: cfg.ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        ),
      );
    });

    // shine pass (Diamond double-blinks)
    const up = { toValue: 1, duration: 620, easing: Easing.inOut(Easing.quad), useNativeDriver: true };
    const down = { toValue: 0, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true };
    loops.push(
      Animated.loop(
        Animated.sequence(
          fx.glint.double
            ? [
                Animated.delay(fx.glint.everyMs),
                Animated.timing(glint, up),
                Animated.timing(glint, { ...down, toValue: 0.3, duration: 240 }),
                Animated.timing(glint, { ...up, duration: 300 }),
                Animated.timing(glint, down),
              ]
            : [Animated.delay(fx.glint.everyMs), Animated.timing(glint, up), Animated.timing(glint, down)],
        ),
      ),
    );

    // twinkles
    sparks.forEach((tw, i) => {
      loops.push(
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 700 + (fx.sparkles.slow ? 2600 : 400)),
            Animated.timing(tw, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(tw, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.delay(fx.sparkles.slow ? 3200 : 1200),
          ]),
        ),
      );
    });

    // drifting wisp (Spark)
    if (fx.drift) {
      loops.push(
        Animated.loop(
          Animated.sequence([
            Animated.timing(driftV, { toValue: 1, duration: 3400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(driftV, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        ),
      );
    }

    // orbiting light (500 Club)
    if (fx.orbit) {
      loops.push(
        Animated.loop(
          Animated.timing(orbitV, { toValue: 1, duration: fx.orbit.ms, easing: Easing.linear, useNativeDriver: true }),
        ),
      );
    }

    const t = setTimeout(() => loops.forEach((l) => l.start()), stagger);
    return () => {
      clearTimeout(t);
      loops.forEach((l) => l.stop());
    };
  }, [motion, fx, halo, glint, driftV, orbitV, embers, sparks, stagger]);

  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [0.92, fx.halo.scaleTo] });
  const haloOpacity = motion
    ? halo.interpolate({ inputRange: [0, 1], outputRange: [fx.halo.max * 0.35, fx.halo.max] })
    : fx.halo.max * 0.4; // calm static aura when motion is off
  const orbitSpin = orbitV.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const haloSize = size * 0.94;
  const dot = Math.max(2.5, size * 0.055);

  return (
    <View
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
      accessibilityRole="image"
      accessibilityLabel={`Medal: ${icon.replace('-', ' ')}`}
    >
      {/* pulsing halo behind the art */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: haloSize,
          height: haloSize,
          borderRadius: haloSize / 2,
          backgroundColor: fx.halo.color,
          opacity: haloOpacity,
          transform: [{ scale: haloScale }],
        }}
      />

      {/* drifting smoke wisp, behind the art (Spark) */}
      {motion && fx.drift ? (
        <Animated.Image
          source={SMOKE}
          style={{
            position: 'absolute',
            width: size * 0.55,
            height: size * 0.55,
            left: size * 0.28,
            top: size * 0.1,
            tintColor: fx.drift.color,
            opacity: driftV.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, fx.drift.max, 0] }),
            transform: [
              { translateY: driftV.interpolate({ inputRange: [0, 1], outputRange: [size * 0.06, -size * 0.3] }) },
              { translateX: driftV.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.06] }) },
              { scale: driftV.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] }) },
            ],
          }}
        />
      ) : null}

      {/* the exact medal artwork — never altered */}
      <Animated.Image source={art} resizeMode="contain" style={{ width: size, height: size }} />

      {/* shape-exact heat / shimmer breathing (tinted copies of the art) */}
      {motion
        ? embers.map((e, i) => (
            <Animated.Image
              key={`ember-${i}`}
              source={art}
              resizeMode="contain"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: size,
                height: size,
                tintColor: fx.embers[i].color,
                opacity: e.interpolate({ inputRange: [0, 1], outputRange: [0, fx.embers[i].max] }),
              }}
            />
          ))
        : null}

      {/* brief shine pass over the whole artwork */}
      {motion ? (
        <Animated.Image
          source={art}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: size,
            height: size,
            tintColor: '#FFFFFF',
            opacity: glint.interpolate({ inputRange: [0, 1], outputRange: [0, fx.glint.bright] }),
          }}
        />
      ) : null}

      {/* orbiting light (500 Club's globe) */}
      {motion && fx.orbit ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size,
            height: size,
            transform: [{ rotate: orbitSpin }],
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: size / 2 - dot / 2,
              top: size * 0.06,
              width: dot,
              height: dot,
              borderRadius: dot,
              backgroundColor: fx.orbit.color,
              shadowColor: fx.orbit.color,
              shadowOpacity: 0.9,
              shadowRadius: dot * 1.4,
              shadowOffset: { width: 0, height: 0 },
              ...(Platform.OS === 'android' ? { elevation: 2 } : null),
            }}
          />
        </Animated.View>
      ) : null}

      {/* twinkling motes */}
      {sparks.map((tw, i) => (
        <Animated.View
          key={`spark-${i}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: size * SPARK_POS[i % SPARK_POS.length][0],
            top: size * SPARK_POS[i % SPARK_POS.length][1],
            opacity: tw,
            transform: [{ scale: tw.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
          }}
        >
          <View
            style={{
              width: dot,
              height: dot,
              borderRadius: dot,
              backgroundColor: fx.sparkles.color,
              shadowColor: fx.sparkles.color,
              shadowOpacity: 0.9,
              shadowRadius: dot,
              shadowOffset: { width: 0, height: 0 },
              ...(Platform.OS === 'android' ? { elevation: 2 } : null),
            }}
          />
        </Animated.View>
      ))}
    </View>
  );
}
