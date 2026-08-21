import { useEffect, useMemo, useRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { ShareStudioContext, ShareStudioResult } from '../share/shareStudioDraft';
import { useAppTheme } from '../ui/AppThemeProvider';
import { font, type AppThemeColors } from '../ui/theme';

export const PROGRESS_SHARE_WIDTH = 1080;
export const PROGRESS_SHARE_HEIGHT = 1350;
export const PROGRESS_SHARE_ASPECT_RATIO = PROGRESS_SHARE_WIDTH / PROGRESS_SHARE_HEIGHT;

export type ProgressSharePeriod = 'week' | 'month';

export type ProgressSharePrivatePhoto = Readonly<{
  id: string;
  storagePath: string;
  capturedAt: string;
  localUri: string;
}>;

export type ProgressShareSnapshot = Readonly<{
  ownerId: string;
  period: ProgressSharePeriod;
  openedAt: string;
  workouts: number;
  activeDays: number;
  tasksDone: number;
  weightKg: number | null;
  bmi: number | null;
  bodyMeasurement: Readonly<{ id: string; recordedAt: string; weightKg: number; heightCm: number }> | null;
  context: ShareStudioContext;
  privatePhotos: readonly ProgressSharePrivatePhoto[];
}>;

export type ProgressShareRenderModel = Readonly<{
  title: string;
  date: string;
  periodLabel: 'WEEKLY PROGRESS' | 'MONTHLY PROGRESS';
  metrics: ShareStudioContext['metrics'];
  caption: string;
  sharePhotoUri: string | null;
  beforePhoto: Readonly<{ uri: string; date: string }> | null;
  latestPhoto: Readonly<{ uri: string; date: string }> | null;
}>;

export type ProgressShareMediaState = Readonly<{
  fingerprint: string;
  status: 'loading' | 'error' | 'ready';
  message?: string;
}>;

/** Builds the one immutable renderer input used by both review and capture. */
export function createProgressShareRenderModel(
  snapshot: ProgressShareSnapshot,
  draft: Pick<ShareStudioResult, 'context' | 'caption' | 'media'>,
): ProgressShareRenderModel {
  const privatePhotos = draft.media.kind === 'card' ? snapshot.privatePhotos : [];
  const before = privatePhotos[0] ?? null;
  const latest = privatePhotos.length > 1 ? privatePhotos.at(-1) ?? null : null;
  return Object.freeze({
    title: draft.context.title,
    date: draft.context.date,
    periodLabel: snapshot.period === 'week' ? 'WEEKLY PROGRESS' : 'MONTHLY PROGRESS',
    metrics: Object.freeze(draft.context.metrics.map((metric) => Object.freeze({ ...metric }))),
    caption: draft.caption,
    sharePhotoUri: draft.media.kind === 'photo' ? draft.media.uri : null,
    beforePhoto: before ? Object.freeze({ uri: before.localUri, date: before.capturedAt }) : null,
    latestPhoto: latest ? Object.freeze({ uri: latest.localUri, date: latest.capturedAt }) : null,
  });
}

export function progressShareRenderModelFingerprint(model: ProgressShareRenderModel): string {
  return JSON.stringify({
    title: model.title,
    date: model.date,
    periodLabel: model.periodLabel,
    metrics: model.metrics,
    caption: model.caption,
    sharePhotoUri: model.sharePhotoUri,
    beforePhoto: model.beforePhoto,
    latestPhoto: model.latestPhoto,
  });
}

export function ProgressShareCard({ model, onMediaStateChange }: Readonly<{
  model: ProgressShareRenderModel;
  onMediaStateChange?: (state: ProgressShareMediaState) => void;
}>) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const hasComparison = model.beforePhoto !== null;
  const fingerprint = progressShareRenderModelFingerprint(model);
  const callbackRef = useRef(onMediaStateChange);
  const mediaStateRef = useRef<{
    fingerprint: string;
    expected: ReadonlyMap<string, string>;
    loaded: Set<string>;
    failed: boolean;
  } | null>(null);
  const sharePhotoUri = model.sharePhotoUri;
  const beforePhotoUri = model.beforePhoto?.uri ?? null;
  const latestPhotoUri = model.latestPhoto?.uri ?? null;
  const photoDescription = [
    model.beforePhoto ? `Before photo, ${formatProgressPhotoDate(model.beforePhoto.date)}` : null,
    model.latestPhoto ? `Latest photo, ${formatProgressPhotoDate(model.latestPhoto.date)}` : null,
  ].filter(Boolean).join('. ');
  const expectedMedia = useMemo(() => {
    const entries: [string, string][] = [];
    if (sharePhotoUri) entries.push(['share', sharePhotoUri]);
    else {
      if (beforePhotoUri) entries.push(['before', beforePhotoUri]);
      if (latestPhotoUri) entries.push(['latest', latestPhotoUri]);
    }
    return new Map(entries);
  }, [beforePhotoUri, latestPhotoUri, sharePhotoUri]);

  useEffect(() => {
    callbackRef.current = onMediaStateChange;
  }, [onMediaStateChange]);

  useEffect(() => {
    mediaStateRef.current = { fingerprint, expected: expectedMedia, loaded: new Set(), failed: false };
    callbackRef.current?.(expectedMedia.size === 0
      ? { fingerprint, status: 'ready' }
      : { fingerprint, status: 'loading' });
  }, [expectedMedia, fingerprint]);

  const mediaLoaded = (slot: string, uri: string, eventFingerprint: string) => {
    const current = mediaStateRef.current;
    if (!current || current.fingerprint !== eventFingerprint || current.failed || current.expected.get(slot) !== uri) return;
    current.loaded.add(slot);
    if (current.loaded.size === current.expected.size) callbackRef.current?.({ fingerprint: eventFingerprint, status: 'ready' });
  };
  const mediaFailed = (slot: string, uri: string, eventFingerprint: string) => {
    const current = mediaStateRef.current;
    if (!current || current.fingerprint !== eventFingerprint || current.failed || current.expected.get(slot) !== uri) return;
    current.failed = true;
    callbackRef.current?.({
      fingerprint: eventFingerprint,
      status: 'error',
      message: 'That image could not load. Choose another photo or use Card only.',
    });
  };
  return (
    <View
      testID="progress-share-card"
      accessibilityRole="image"
      accessibilityLabel={`${model.periodLabel.toLowerCase()}: ${model.metrics.map((metric) => `${metric.label} ${metric.value}`).join(', ')}${photoDescription ? `. ${photoDescription}` : ''}`}
      style={[styles.card, { aspectRatio: PROGRESS_SHARE_ASPECT_RATIO }]}
    >
      {model.sharePhotoUri ? (
        <Image
          key={`${fingerprint}:share:${model.sharePhotoUri}`}
          source={{ uri: model.sharePhotoUri }} resizeMode="cover" style={styles.heroPhoto} accessible={false}
          onLoad={() => mediaLoaded('share', model.sharePhotoUri!, fingerprint)}
          onError={() => mediaFailed('share', model.sharePhotoUri!, fingerprint)}
        />
      ) : hasComparison ? (
        <View testID="progress-before-after" style={styles.comparison}>
          <ProgressImage label="Before" slot="before" photo={model.beforePhoto!} fingerprint={fingerprint} onLoad={mediaLoaded} onError={mediaFailed} styles={styles} />
          {model.latestPhoto ? <ProgressImage label="Latest" slot="latest" photo={model.latestPhoto} fingerprint={fingerprint} onLoad={mediaLoaded} onError={mediaFailed} styles={styles} /> : null}
        </View>
      ) : (
        <View style={styles.emptyVisual}>
          <Text maxFontSizeMultiplier={1.25} style={styles.emptyMark}>A</Text>
          <Text maxFontSizeMultiplier={1.25} style={styles.emptyCopy}>SHOWING UP, ONE DAY AT A TIME</Text>
        </View>
      )}

      <View style={styles.shade} />
      <View style={styles.content}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text maxFontSizeMultiplier={1.2} style={styles.brandMarkText}>A</Text></View>
          <Text maxFontSizeMultiplier={1.2} style={styles.brand}>ACCOUNTABILITY</Text>
        </View>
        <View style={styles.copyBlock}>
          <Text maxFontSizeMultiplier={1.35} style={styles.eyebrow}>{model.periodLabel} · {model.date}</Text>
          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72} maxFontSizeMultiplier={1.25} style={styles.title}>{model.title}</Text>
          <View style={styles.metrics}>
            {model.metrics.map((metric) => (
              <View key={`${metric.label}:${metric.value}`} style={styles.metric}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.2} style={styles.metricValue}>{metric.value}</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.2} style={styles.metricLabel}>{metric.label}</Text>
              </View>
            ))}
          </View>
          {model.caption ? <Text numberOfLines={2} maxFontSizeMultiplier={1.25} style={styles.caption}>{model.caption}</Text> : null}
        </View>
      </View>
    </View>
  );
}

function ProgressImage({ label, slot, photo, fingerprint, onLoad, onError, styles }: Readonly<{
  label: 'Before' | 'Latest';
  slot: 'before' | 'latest';
  photo: Readonly<{ uri: string; date: string }>;
  fingerprint: string;
  onLoad: (slot: string, uri: string, fingerprint: string) => void;
  onError: (slot: string, uri: string, fingerprint: string) => void;
  styles: ReturnType<typeof createStyles>;
}>) {
  return (
    <View style={styles.comparisonItem}>
      <Image
        key={`${fingerprint}:${slot}:${photo.uri}`}
        source={{ uri: photo.uri }} resizeMode="cover" style={styles.comparisonPhoto} accessible={false}
        onLoad={() => onLoad(slot, photo.uri, fingerprint)}
        onError={() => onError(slot, photo.uri, fingerprint)}
      />
      <View style={styles.photoLabel}>
        <Text maxFontSizeMultiplier={1.2} style={styles.photoLabelText}>{label.toUpperCase()}</Text>
        <Text maxFontSizeMultiplier={1.2} style={styles.photoDateText}>{formatProgressPhotoDate(photo.date)}</Text>
      </View>
    </View>
  );
}

function formatProgressPhotoDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  card: { width: '100%', overflow: 'hidden', backgroundColor: theme.surface.inverse, position: 'relative' },
  heroPhoto: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  comparison: { position: 'absolute', inset: 0, flexDirection: 'row', gap: 2 },
  comparisonItem: { flex: 1, overflow: 'hidden' },
  comparisonPhoto: { width: '100%', height: '100%' },
  photoLabel: { position: 'absolute', top: '6%', left: '7%', paddingHorizontal: '5%', paddingVertical: '2%', backgroundColor: 'rgba(8,26,58,0.72)' },
  photoLabelText: { color: '#FFFFFF', fontFamily: font.bold, fontSize: 11, letterSpacing: 1.5 },
  photoDateText: { color: '#D9E7FF', fontFamily: font.medium, fontSize: 9, marginTop: 2 },
  emptyVisual: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.ink.action },
  emptyMark: { color: 'rgba(255,255,255,0.18)', fontFamily: font.bold, fontSize: 210, lineHeight: 230 },
  emptyCopy: { color: 'rgba(255,255,255,0.68)', fontFamily: font.bold, fontSize: 11, letterSpacing: 2 },
  shade: { position: 'absolute', inset: 0, backgroundColor: 'rgba(8,26,58,0.42)' },
  content: { flex: 1, justifyContent: 'space-between', paddingHorizontal: '7%', paddingTop: '7%', paddingBottom: '7%' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  brandMarkText: { color: '#155EEF', fontFamily: font.bold, fontSize: 17 },
  brand: { color: '#FFFFFF', fontFamily: font.bold, fontSize: 11, letterSpacing: 1.7 },
  copyBlock: { gap: 10 },
  eyebrow: { color: '#D9E7FF', fontFamily: font.bold, fontSize: 11, letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontFamily: font.bold, fontSize: 37, lineHeight: 43 },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, minWidth: 0, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.42)', paddingTop: 9 },
  metricValue: { color: '#FFFFFF', fontFamily: font.bold, fontSize: 22 },
  metricLabel: { color: '#D9E7FF', fontFamily: font.medium, fontSize: 10, marginTop: 2 },
  caption: { color: '#FFFFFF', fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
});
