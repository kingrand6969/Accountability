import { forwardRef, type ReactNode } from 'react';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { OsmMapProps } from '../ui/OsmMap';
import { RouteTrace } from './RouteTrace';
import { estimateCalories, formatDuration, formatKm, formatPace, type Pt } from './geo';
import {
  formatRunCardTimestamp,
  runShareLayoutLabel,
  type RunCardTheme,
  type RunShareFont,
  type RunShareLayout,
} from './runShareAppearance';

const ROUTE = '#C8FF45';

const fontFamilies: Record<RunShareFont, string> = {
  momentum: 'SpaceGrotesk_700Bold',
  classic: 'Inter_800ExtraBold',
  strong: 'Sora_700Bold',
  street: 'BowlbyOneSC_400Regular',
};

type RunCardProps = {
  mode: 'photo' | 'map';
  photoUri: string | null;
  distanceM: number;
  durationS: number;
  points: Pt[];
  width: number;
  aspectRatio?: number;
  mediaFit?: 'cover' | 'contain';
  layout?: RunShareLayout;
  font?: RunShareFont;
  theme?: RunCardTheme;
  title?: string;
  completedAt?: string;
  showTimestamp?: boolean;
  showEndpoints?: boolean;
};

/** The reviewed Run card. This exact view is reused for preview and Feed capture. */
export const RunCard = forwardRef<View, RunCardProps>(function RunCard(
  {
    mode,
    photoUri,
    distanceM,
    durationS,
    points,
    width,
    aspectRatio = 4 / 5,
    mediaFit = 'cover',
    layout = 'map-focus',
    font = 'momentum',
    theme = 'night',
    title = 'Run complete',
    completedAt,
    showTimestamp = true,
    showEndpoints = false,
  },
  ref,
) {
  const height = Math.round(width / aspectRatio);
  const usePhoto = mode === 'photo' && !!photoUri;
  const fontFamily = fontFamilies[font];
  const timestamp = showTimestamp && completedAt ? formatRunCardTimestamp(completedAt) : '';
  const distance = formatKm(distanceM);
  const pace = formatPace(distanceM, durationS);
  const duration = formatDuration(durationS);
  const calories = String(estimateCalories('run', distanceM));
  const route = points.map((point) => ({ lat: point.lat, lng: point.lon }));
  const markers = showEndpoints && route.length > 1
    ? [
        { ...route[0], color: '#16A36A' },
        { ...route[route.length - 1], color: '#FF642F' },
      ]
    : [];
  const light = theme === 'day';
  const ink = light && !usePhoto ? '#0C1C2A' : '#FFFFFF';
  const muted = light && !usePhoto ? '#52616B' : 'rgba(255,255,255,0.72)';
  const content = (
    <>
      <LinearGradient
        colors={usePhoto
          ? ['rgba(4,12,18,0.48)', 'rgba(4,12,18,0.08)', 'rgba(4,12,18,0.78)']
          : light
            ? ['rgba(247,250,246,0.12)', 'rgba(247,250,246,0.42)', 'rgba(247,250,246,0.86)']
            : ['rgba(3,10,15,0.08)', 'rgba(3,10,15,0.24)', 'rgba(3,10,15,0.88)']}
        locations={[0, 0.52, 1]}
        style={StyleSheet.absoluteFill}
      />
      {usePhoto ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <RouteTrace
            points={points}
            width={width}
            height={height}
            accent={ROUTE}
            stroke={5}
            showEndpoints={showEndpoints}
            endStyle="dot"
            pad={{ top: height * 0.2, bottom: height * 0.24, left: width * 0.17, right: width * 0.17 }}
          />
        </View>
      ) : null}
      <View
        accessible
        accessibilityLabel={`Run card, ${runShareLayoutLabel(layout)} layout`}
        style={styles.content}
      >
        {renderLayout(layout, {
          title,
          timestamp,
          distance,
          pace,
          duration,
          calories,
          fontFamily,
          ink,
          muted,
          compact: width < 280,
          showEndpoints,
        })}
      </View>
    </>
  );

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { width, height }, light && styles.cardLight]}
    >
      {usePhoto ? (
        <ImageBackground
          source={{ uri: photoUri }}
          resizeMode={mediaFit}
          style={StyleSheet.absoluteFill}
        >
          {content}
        </ImageBackground>
      ) : (
        <>
          <RunCardMap
            route={route}
            markers={markers}
            interactive={false}
            showLatestMarker={false}
            tiles={light ? 'osm' : 'dark'}
            style={StyleSheet.absoluteFill}
          />
          {content}
        </>
      )}
    </View>
  );
});

type LayoutData = {
  title: string;
  timestamp: string;
  distance: string;
  pace: string;
  duration: string;
  calories: string;
  fontFamily: string;
  ink: string;
  muted: string;
  compact: boolean;
  showEndpoints: boolean;
};

function renderLayout(layout: RunShareLayout, data: LayoutData): ReactNode {
  switch (layout) {
    case 'center-stack':
      return <CenterStack {...data} />;
    case 'right-rail':
      return <RightRail {...data} />;
    case 'data-horizon':
      return <DataHorizon {...data} />;
    case 'editorial-stack':
      return <EditorialStack {...data} />;
    default:
      return <MapFocus {...data} />;
  }
}

function RunCardMap(props: OsmMapProps) {
  const MapComponent = (
    // Kept lazy so pure RunShareSheet helper tests do not initialize the native WebView module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../ui/OsmMap') as typeof import('../ui/OsmMap')
  ).OsmMap;
  return <MapComponent {...props} />;
}

function Header({ title, timestamp, fontFamily, ink, muted, align = 'left' }: LayoutData & { align?: 'left' | 'center' | 'right' }) {
  return (
    <View style={[styles.header, align === 'center' && styles.centered, align === 'right' && styles.rightAligned]}>
      <Text numberOfLines={2} adjustsFontSizeToFit style={[styles.title, { color: ink, fontFamily, textAlign: align }]}>{title}</Text>
      {timestamp ? <Text style={[styles.timestamp, { color: muted, textAlign: align }]}>{timestamp}</Text> : null}
    </View>
  );
}

function Distance({ data, align = 'left', size = 'large' }: { data: LayoutData; align?: 'left' | 'center' | 'right'; size?: 'large' | 'medium' }) {
  return (
    <View style={[styles.distanceBlock, align === 'center' && styles.centered, align === 'right' && styles.rightAligned]}>
      <Text style={[styles.eyebrow, { color: data.muted, textAlign: align }]}>DISTANCE</Text>
      <View style={[styles.distanceRow, align === 'center' && styles.justifyCenter, align === 'right' && styles.justifyEnd]}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={[
          size === 'large' ? styles.distanceLarge : styles.distanceMedium,
          data.compact && styles.distanceCompact,
          { color: data.ink, fontFamily: data.fontFamily },
        ]}>{data.distance}</Text>
        <Text style={[styles.distanceUnit, { color: data.ink }]}>KM</Text>
      </View>
    </View>
  );
}

function Stat({ value, label, data, align = 'left' }: { value: string; label: string; data: LayoutData; align?: 'left' | 'center' | 'right' }) {
  return (
    <View style={[styles.stat, align === 'center' && styles.centered, align === 'right' && styles.rightAligned]}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.statValue, { color: data.ink, fontFamily: data.fontFamily, textAlign: align }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: data.muted, textAlign: align }]}>{label}</Text>
    </View>
  );
}

function StatRow({ data, includeCalories = true }: { data: LayoutData; includeCalories?: boolean }) {
  return (
    <View style={styles.statRow}>
      <Stat value={data.duration} label="TIME" data={data} />
      <View style={styles.statDivider} />
      <Stat value={data.pace} label="PACE /KM" data={data} />
      {includeCalories ? <><View style={styles.statDivider} /><Stat value={data.calories} label="EST. KCAL" data={data} /></> : null}
    </View>
  );
}

function Privacy({ data }: { data: LayoutData }) {
  return (
    <View style={styles.privacyPill}>
      <View style={[styles.check, !data.showEndpoints && styles.checkActive]}>
        <Text style={styles.checkText}>{data.showEndpoints ? '!' : '✓'}</Text>
      </View>
      <Text style={[styles.privacyText, { color: data.ink }]}>{data.showEndpoints ? 'START & FINISH SHOWN' : 'START & FINISH HIDDEN'}</Text>
    </View>
  );
}

function CenterStack(data: LayoutData) {
  return (
    <View style={styles.full}>
      <Header {...data} align="center" />
      <View style={styles.centerHero}><Distance data={data} align="center" /></View>
      <View style={styles.bottomPanel}><StatRow data={data} /><Privacy data={data} /></View>
    </View>
  );
}

function RightRail(data: LayoutData) {
  return (
    <View style={styles.full}>
      <Header {...data} />
      <View style={styles.rightRail}>
        <Distance data={data} align="right" size="medium" />
        <View style={styles.railLine} />
        <Stat value={data.duration} label="TIME" data={data} align="right" />
        <Stat value={data.pace} label="PACE /KM" data={data} align="right" />
        <Privacy data={data} />
      </View>
    </View>
  );
}

function DataHorizon(data: LayoutData) {
  return (
    <View style={styles.full}>
      <Header {...data} />
      <View style={styles.horizonPanel}>
        <View style={styles.horizonTop}><Distance data={data} size="medium" /><Privacy data={data} /></View>
        <StatRow data={data} />
      </View>
    </View>
  );
}

function EditorialStack(data: LayoutData) {
  return (
    <View style={styles.full}>
      <View style={styles.editorialHeader}><Header {...data} /><Privacy data={data} /></View>
      <View style={styles.editorialStats}>
        <Distance data={data} />
        <Stat value={data.pace} label="PACE /KM" data={data} />
        <Stat value={data.duration} label="TIME" data={data} />
      </View>
    </View>
  );
}

function MapFocus(data: LayoutData) {
  return (
    <View style={styles.full}>
      <Header {...data} />
      <View style={styles.mapFocusBottom}>
        <View style={styles.distancePrivacy}><Distance data={data} /><Privacy data={data} /></View>
        <StatRow data={data} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: 24, backgroundColor: '#07121A' },
  cardLight: { backgroundColor: '#EFF4EF' },
  content: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  full: { flex: 1, padding: '6%' },
  header: { alignSelf: 'stretch', maxWidth: '74%' },
  title: { fontSize: 25, lineHeight: 29, letterSpacing: -0.7 },
  timestamp: { marginTop: 5, fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 1.15 },
  centered: { alignItems: 'center' },
  rightAligned: { alignItems: 'flex-end' },
  justifyCenter: { justifyContent: 'center' },
  justifyEnd: { justifyContent: 'flex-end' },
  centerHero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: '8%' },
  bottomPanel: { gap: 12 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 7, letterSpacing: 1.5 },
  distanceBlock: { alignSelf: 'stretch' },
  distanceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  distanceLarge: { fontSize: 67, lineHeight: 72, letterSpacing: -3.6 },
  distanceMedium: { fontSize: 48, lineHeight: 53, letterSpacing: -2.4 },
  distanceCompact: { fontSize: 42, lineHeight: 47 },
  distanceUnit: { fontFamily: 'Inter_800ExtraBold', fontSize: 13, marginBottom: 10 },
  statRow: { minHeight: 47, flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.42)', paddingTop: 10 },
  stat: { minWidth: 56, flexShrink: 1 },
  statValue: { fontSize: 19, lineHeight: 22, letterSpacing: -0.45 },
  statLabel: { marginTop: 3, fontFamily: 'Inter_700Bold', fontSize: 6, letterSpacing: 0.9 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.28)', marginHorizontal: 5 },
  privacyPill: { minHeight: 28, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 6 },
  check: { width: 17, height: 17, borderRadius: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)' },
  checkActive: { backgroundColor: ROUTE, borderColor: ROUTE },
  checkText: { color: '#07121A', fontFamily: 'Inter_800ExtraBold', fontSize: 11, lineHeight: 13 },
  privacyText: { fontFamily: 'Inter_700Bold', fontSize: 6, letterSpacing: 0.55 },
  rightRail: { position: 'absolute', right: '6%', top: '26%', bottom: '8%', width: '40%', justifyContent: 'space-between', alignItems: 'flex-end', paddingLeft: 13, borderLeftWidth: 2, borderLeftColor: ROUTE },
  railLine: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.4)' },
  horizonPanel: { position: 'absolute', left: '6%', right: '6%', bottom: '6%', gap: 8 },
  horizonTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  editorialHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  editorialStats: { position: 'absolute', left: '6%', bottom: '8%', gap: 12 },
  mapFocusBottom: { position: 'absolute', left: '6%', right: '6%', bottom: '6%', gap: 7 },
  distancePrivacy: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
});
