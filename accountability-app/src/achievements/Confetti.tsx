import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { createConfettiGeometry } from './confettiGeometry';

const COLORS = ['#F2B33D', '#2563eb', '#ef4444', '#16a34a', '#2563eb', '#F49AC6', '#57B6C7'];

/** A one-shot confetti burst from the centre. Mount it when a medal unlocks. */
export function Confetti({ count = 28 }: { count?: number }) {
  const [parts] = useState(() =>
    createConfettiGeometry(count, Math.random).map((geometry, i) => ({
      color: COLORS[i % COLORS.length],
      ...geometry,
      anim: new Animated.Value(0),
    })),
  );

  useEffect(() => {
    parts.forEach((p) =>
      Animated.timing(p.anim, {
        toValue: 1,
        duration: p.duration,
        delay: p.delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(),
    );
  }, [parts]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {parts.map((p, i) => {
        const tx = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * p.dist] });
        const ty = p.anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, Math.sin(p.angle) * p.dist + 70],
        });
        const opacity = p.anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
        const rotate = p.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rot}deg`] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: p.w,
              height: p.h,
              borderRadius: 2,
              backgroundColor: p.color,
              transform: [{ translateX: tx }, { translateY: ty }, { rotate }],
              opacity,
            }}
          />
        );
      })}
    </View>
  );
}
