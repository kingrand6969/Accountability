import { forwardRef } from 'react';
import { Image, ImageBackground, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RouteTrace } from './RouteTrace';
import {
  formatDurationLong,
  formatKm,
  formatPace,
  type Pt,
} from './geo';

const TRACE = '#fb923c'; // warm orange trace, pops on any photo (matches reference)

/**
 * The shareable Run Card. Three looks share one layout:
 *  - 'photo': a selfie or place photo behind centered stats + a route strip
 *  - 'map': the route trace is the hero on a dark backdrop
 * Stats are Distance · Pace · Time (no BPM). Logo sits lower-left.
 * forwardRef so the parent can captureRef() this exact view.
 */
export const RunCard = forwardRef<
  View,
  {
    mode: 'photo' | 'map';
    photoUri: string | null;
    distanceM: number;
    durationS: number;
    points: Pt[];
    width: number;
    aspectRatio?: number;
    mediaFit?: 'cover' | 'contain';
  }
>(function RunCard({ mode, photoUri, distanceM, durationS, points, width, aspectRatio = 4 / 5, mediaFit = 'cover' }, ref) {
  // 4:5 portrait — the modern share ratio (Instagram/FB): tall enough to look
  // like a card, short enough not to dominate the feed, and it matches the
  // feed's 4:5 frame so it shows whole with no crop.
  const height = Math.round(width / aspectRatio);
  const usePhoto = mode === 'photo' && !!photoUri;
  const landscape = aspectRatio > 1.2;
  const compact = width < 270 || height < 310;

  const stats = (
    <View style={landscape ? styles.statsLandscape : usePhoto ? styles.statsPhoto : styles.statsMap}>
      <Stat label="Distance" value={formatKm(distanceM)} unit="km" compact={compact} />
      <Stat label="Pace" value={formatPace(distanceM, durationS)} unit="/km" compact={compact} />
      <Stat label="Time" value={formatDurationLong(durationS)} compact={compact} />
    </View>
  );

  const logo = (
    <Image
      source={require('../../assets/images/logo-mark.png')}
      style={[styles.logo, compact && styles.logoCompact]}
    />
  );

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
      {usePhoto ? (
        <ImageBackground source={{ uri: photoUri! }} style={StyleSheet.absoluteFill} resizeMode={mediaFit}>
          <LinearGradient
            colors={[
              'rgba(0,0,0,0.62)',
              'rgba(0,0,0,0.32)',
              'rgba(0,0,0,0.2)',
              'rgba(0,0,0,0.35)',
              'rgba(0,0,0,0.78)',
            ]}
            locations={[0, 0.28, 0.55, 0.78, 1]}
            style={StyleSheet.absoluteFill}
          />
          {stats}
          {/* route strip along the bottom */}
          <View style={styles.stripWrap} pointerEvents="none">
            <RouteTrace
              points={points}
              width={width}
              height={Math.round(height * 0.2)}
              stroke={4}
              accent={TRACE}
              endStyle="dot"
              pad={{ top: 14, bottom: 14, left: 28, right: 28 }}
            />
          </View>
          {logo}
        </ImageBackground>
      ) : (
        <LinearGradient colors={['#0e1420', '#141b2b', '#0b1018']} style={StyleSheet.absoluteFill}>
          {/* the trace is the hero */}
          <RouteTrace
            points={points}
            width={width}
            height={height}
            stroke={6}
            accent={TRACE}
            endStyle="dot"
            pad={{ top: Math.round(height * 0.28), bottom: Math.round(height * 0.14), left: 40, right: 40 }}
          />
          {stats}
          {logo}
        </LinearGradient>
      )}
    </View>
  );
});

function Stat({ label, value, unit, compact = false }: { label: string; value: string; unit?: string; compact?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, compact && styles.statLabelCompact]}>{label}</Text>
      <View style={styles.statValRow}>
        <Text style={[styles.statVal, compact && styles.statValCompact]}>{value}</Text>
        {unit ? <Text style={[styles.statUnit, compact && styles.statUnitCompact]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.55)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 8,
} as const;

const styles = StyleSheet.create({
  card: { borderRadius: 24, overflow: 'hidden', backgroundColor: '#0b1018' },
  statsPhoto: { position: 'absolute', top: '9%', left: 0, right: 0, alignItems: 'center', gap: 14 },
  statsMap: { position: 'absolute', top: '6%', left: 0, right: 0, alignItems: 'center', gap: 12 },
  statsLandscape: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    gap: 8,
  },
  stat: { alignItems: 'center' },
  statLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    letterSpacing: 0.5,
    ...shadow,
  },
  statValRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  statVal: {
    color: '#fff',
    fontFamily: 'Anton_400Regular',
    fontSize: 42,
    lineHeight: 46,
    includeFontPadding: false,
    ...shadow,
  },
  statUnit: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    marginBottom: 7,
    ...shadow,
  },
  statLabelCompact: { fontSize: 10 },
  statValCompact: { fontSize: 27, lineHeight: 31 },
  statUnitCompact: { fontSize: 12, marginBottom: 4 },
  stripWrap: { position: 'absolute', left: 0, right: 0, bottom: '9%' },
  logo: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    width: 40,
    height: 40,
  },
  logoCompact: { width: 29, height: 29, left: 10, bottom: 10 },
});
