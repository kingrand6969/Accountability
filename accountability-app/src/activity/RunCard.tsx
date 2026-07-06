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
  }
>(function RunCard({ mode, photoUri, distanceM, durationS, points, width }, ref) {
  const height = Math.round((width * 16) / 9);
  const usePhoto = mode === 'photo' && !!photoUri;

  const stats = (
    <View style={usePhoto ? styles.statsPhoto : styles.statsMap}>
      <Stat label="Distance" value={formatKm(distanceM)} unit="km" />
      <Stat label="Pace" value={formatPace(distanceM, durationS)} unit="/km" />
      <Stat label="Time" value={formatDurationLong(durationS)} />
    </View>
  );

  const logo = (
    <View style={styles.logoRow}>
      <Image source={require('../../assets/images/logo.png')} style={styles.logo} />
      <Text style={styles.logoText}>AccountAbility</Text>
    </View>
  );

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
      {usePhoto ? (
        <ImageBackground source={{ uri: photoUri! }} style={StyleSheet.absoluteFill} resizeMode="cover">
          <LinearGradient
            colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.7)']}
            locations={[0, 0.35, 0.7, 1]}
            style={StyleSheet.absoluteFill}
          />
          {stats}
          {/* route strip along the bottom */}
          <View style={styles.stripWrap} pointerEvents="none">
            <RouteTrace
              points={points}
              width={width}
              height={Math.round(height * 0.22)}
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

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValRow}>
        <Text style={styles.statVal}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
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
  statsPhoto: { position: 'absolute', top: '12%', left: 0, right: 0, alignItems: 'center', gap: 18 },
  statsMap: { position: 'absolute', top: '7%', left: 0, right: 0, alignItems: 'center', gap: 14 },
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
    fontSize: 46,
    lineHeight: 50,
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
  stripWrap: { position: 'absolute', left: 0, right: 0, bottom: '9%' },
  logoRow: {
    position: 'absolute',
    left: 18,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logo: { width: 22, height: 22, borderRadius: 5 },
  logoText: {
    color: 'rgba(255,255,255,0.92)',
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 13,
    letterSpacing: 0.5,
    ...shadow,
  },
});
