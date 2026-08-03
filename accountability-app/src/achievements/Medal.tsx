import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LOCKED_META, TIER_META, medalMetal, type MedalState } from './catalog';
import { MedalIcon } from './MedalIcon';
import { medalArtFor, type MedalTierIndex } from './medalArt';

/**
 * A medal in the Trophy Case.
 *
 * UNLOCKED → the real artwork, animated (<MedalIcon />).
 * LOCKED   → the SAME artwork as a dimmed preview with a small lock chip, so a
 *            member can see what they are working toward. A wall of identical
 *            padlocks tells you nothing and hides the art; a ghosted medal is
 *            the thing that actually pulls people forward.
 * Families without artwork fall back to the drawn metal coin.
 */
export function Medal({
  state,
  size = 92,
  animate = true,
}: {
  state: MedalState;
  size?: number;
  animate?: boolean;
}) {
  // locked medals preview the FIRST tier — "here's what the first one looks like"
  const artKey = medalArtFor(state.def.id, state.unlocked ? state.tierIndex : 0);
  if (artKey) {
    if (!state.unlocked) {
      return (
        <View style={{ width: size, height: size }}>
          <View style={styles.lockedArt}>
            <MedalIcon icon={artKey} size={size} animated={false} tier={0} />
          </View>
          <View style={[styles.lockChip, { borderRadius: size * 0.14 }]}>
            <Ionicons name="lock-closed" size={Math.round(size * 0.15)} color="#fff" />
          </View>
        </View>
      );
    }
    return (
      <MedalIcon
        icon={artKey}
        size={size}
        animated={animate}
        tier={medalMetal(state.def, state.tierIndex) as MedalTierIndex}
      />
    );
  }
  return <MedalCoin state={state} size={size} animate={animate} />;
}

/** The original drawn coin — locked medals and families without artwork. */
function MedalCoin({
  state,
  size = 92,
  animate = true,
}: {
  state: MedalState;
  size?: number;
  animate?: boolean;
}) {
  const meta = state.unlocked ? TIER_META[medalMetal(state.def, state.tierIndex)] : LOCKED_META;
  const [shine] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  const [float] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!animate || !state.unlocked) return;
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.delay(1400),
          Animated.timing(shine, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(float, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(float, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [animate, state.unlocked, shine, pulse, float]);

  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.22] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const shineX = shine.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.85, size * 0.95] });

  const disc = size;
  const iconSize = Math.round(size * 0.42);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {state.unlocked ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              width: disc,
              height: disc,
              borderRadius: disc / 2,
              backgroundColor: meta.glow,
              transform: [{ scale: haloScale }],
              opacity: haloOpacity,
            },
          ]}
        />
      ) : null}

      <Animated.View
        style={[
          styles.shadowWrap,
          { borderRadius: disc / 2, transform: [{ translateY: floatY }], shadowColor: meta.dark },
        ]}
      >
        <View style={[styles.coin, { width: disc, height: disc, borderRadius: disc / 2 }]}>
          <LinearGradient
            colors={[meta.light, meta.base, meta.dark]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* soft top-left highlight for a rounded, coin-like sheen */}
          <LinearGradient
            colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
            start={{ x: 0.2, y: 0.15 }}
            end={{ x: 0.75, y: 0.7 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Ionicons
            name={state.unlocked ? state.def.icon : 'lock-closed'}
            size={iconSize}
            color={state.unlocked ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.75)'}
            style={styles.icon}
          />
          {/* moving glint */}
          {state.unlocked ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.glint, { transform: [{ translateX: shineX }, { rotate: '22deg' }] }]}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: size * 0.5, height: size * 1.8 }}
              />
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // dimmed enough to read as "not yet yours", solid enough to still tempt
  lockedArt: { opacity: 0.32 },
  lockChip: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    backgroundColor: 'rgba(71,85,105,0.92)',
    paddingHorizontal: 5,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: { position: 'absolute' },
  shadowWrap: {
    ...(Platform.OS === 'android'
      ? { elevation: 6 }
      : {
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
        }),
  },
  coin: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  icon: {
    textShadowColor: 'rgba(0,0,0,0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  glint: { position: 'absolute', top: -20, left: 0 },
});
