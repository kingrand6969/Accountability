import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

/**
 * Circular progress arc. Draws a faint track plus a gradient arc that fills
 * clockwise from 12 o'clock, with a glowing dot at the arc's end. The arc
 * sweeps to its value on mount/change (a one-shot ease-out, ~700ms).
 */
export function ProgressRing({
  size,
  strokeWidth = 6,
  progress, // 0..1
  trackColor = 'rgba(255,255,255,0.18)',
  startColor = '#ffffff',
  endColor = '#fde68a',
  animate = true,
}: {
  size: number;
  strokeWidth?: number;
  progress: number;
  trackColor?: string;
  startColor?: string;
  endColor?: string;
  animate?: boolean;
}) {
  const target = Math.min(1, Math.max(0, progress));
  const [anim] = useState(() => new Animated.Value(0));
  const [animatedShown, setAnimatedShown] = useState(0);

  useEffect(() => {
    if (!animate) return;
    // SVG props aren't native-driver animatable — drive re-renders via listener.
    // One-shot ~700ms sweep; only runs when the value actually changes.
    const id = anim.addListener(({ value }) => setAnimatedShown(value));
    Animated.timing(anim, {
      toValue: target,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [target, animate, anim]);

  const shown = animate ? animatedShown : target;
  const clamped = Math.min(1, Math.max(0, shown));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  // arc end position (arc starts at 12 o'clock, sweeps clockwise)
  const angle = clamped * 2 * Math.PI - Math.PI / 2;
  const dotX = cx + r * Math.cos(angle);
  const dotY = cy + r * Math.sin(angle);

  return (
    <Svg width={size} height={size}>
      <Defs>
        <SvgGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={startColor} />
          <Stop offset="100%" stopColor={endColor} />
        </SvgGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      {clamped > 0 ? (
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="url(#ring)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c * clamped} ${c}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ) : null}
      {clamped > 0 ? (
        <>
          <Circle cx={dotX} cy={dotY} r={strokeWidth * 1.1} fill={endColor} opacity={0.35} />
          <Circle cx={dotX} cy={dotY} r={strokeWidth * 0.62} fill="#fff" />
        </>
      ) : null}
    </Svg>
  );
}
