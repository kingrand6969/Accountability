import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { useAuth } from '../auth/AuthProvider';
import { getInsights, type Insights } from '../insights/api';
import { JourneyTabs } from '../journey/JourneyTabs';
import { addMeasurement, listMeasurements, listProgressPhotos } from '../progress/api';
import { calculateBmi } from '../progress/bmi';
import { BodyCheckInSheet } from '../progress/BodyCheckInSheet';
import { ProgressPhotoVault } from '../progress/ProgressPhotoVault';
import { createProgressShareRenderModel, progressShareRenderModelFingerprint, ProgressShareCard, PROGRESS_SHARE_ASPECT_RATIO, type ProgressShareMediaState, type ProgressShareSnapshot } from '../progress/ProgressShareCard';
import { clearProgressPublishArtifacts, prepareProgressShareSnapshot, progressSnapshotInput, publishProgressPost } from '../progress/publishProgressPost';
import type { AddMeasurementInput, BodyMeasurement, ProgressPhoto } from '../progress/types';
import { WeightTrendChart, type TrendPeriod } from '../progress/WeightTrendChart';
import { ShareStudio, type ShareStudioResult, type ShareStudioPreviewState } from '../share/ShareStudio';
import { feedShareAvailability } from '../share/feedShareAvailability';
import { useAppTheme } from '../ui/AppThemeProvider';
import { font, spacing, type AppThemeColors } from '../ui/theme';

const INITIAL_ERROR = 'Your progress couldn’t load. Check your connection and try again.';
const REFRESH_ERROR = 'Your progress couldn’t refresh. Your saved progress is still shown.';

type Snapshot = {
  ownerId: string;
  referenceTime: number;
  measurements: BodyMeasurement[];
  photos: ProgressPhoto[];
  insights: Insights;
};

type FocusLease = {
  readonly epoch: number;
  alive: boolean;
};

type ShareSession = Readonly<{ ownerId: string; ownerToken: symbol; snapshot: ProgressShareSnapshot }>;
type SharePreparing = Readonly<{ ownerId: string; ownerToken: symbol; lease: symbol }>;
type MountedSharePreview = Readonly<{ ownerId: string; ownerToken: symbol; fingerprint: string }>;

function activeTime(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

function formattedDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function JourneyProgress() {
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const ownerToken = useMemo(() => Symbol(ownerId ?? 'signed-out'), [ownerId]);
  const ownerRef = useRef(ownerId);
  const generationRef = useRef(0);
  const focusEpochRef = useRef(0);
  const activeFocusRef = useRef<FocusLease | null>(null);
  const mountedRef = useRef(true);
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const [loadingOwner, setLoadingOwner] = useState<string | null>(ownerId);
  const [initialErrorOwner, setInitialErrorOwner] = useState<string | null>(null);
  const [refreshErrorOwner, setRefreshErrorOwner] = useState<string | null>(null);
  const [sheetState, setSheetState] = useState<{ ownerId: string; token: symbol } | null>(null);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('week');
  const [shareSession, setShareSession] = useState<ShareSession | null>(null);
  const [sharePreparingState, setSharePreparingState] = useState<SharePreparing | null>(null);
  const [shareErrorState, setShareErrorState] = useState<{ ownerId: string; ownerToken: symbol; message: string } | null>(null);
  const sharePrepareLeaseRef = useRef<symbol | null>(null);
  const shareCardRef = useRef<View | null>(null);
  const mountedSharePreviewRef = useRef<MountedSharePreview | null>(null);
  const shareOperationRef = useRef<{ ownerId: string; operationId: string } | null>(null);
  const previousOwnerRef = useRef(ownerId);
  const [previewReadiness, setPreviewReadiness] = useState<(ProgressShareMediaState & { ownerId: string; ownerToken: symbol }) | null>(null);
  const feedShare = useMemo(() => feedShareAvailability(Platform.OS), []);

  useEffect(() => {
    const previousOwner = previousOwnerRef.current;
    const ownerChanged = previousOwner !== ownerId;
    if (previousOwner && ownerChanged) clearProgressPublishArtifacts(previousOwner);
    previousOwnerRef.current = ownerId;
    mountedRef.current = true;
    ownerRef.current = ownerId;
    snapshotRef.current = snapshot;
    sharePrepareLeaseRef.current = null;
    if (ownerChanged) {
      mountedSharePreviewRef.current = null;
      shareOperationRef.current = null;
    }
  }, [ownerId, snapshot]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      if (ownerRef.current) clearProgressPublishArtifacts(ownerRef.current);
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  const load = useCallback((focus = activeFocusRef.current) => {
    if (!ownerId || !focus?.alive || activeFocusRef.current !== focus) return () => {};
    const capturedOwner = ownerId;
    const capturedFocusEpoch = focus.epoch;
    const generation = ++generationRef.current;
    const hasCachedData = snapshotRef.current?.ownerId === capturedOwner;
    const canCommit = () => (
      focus.alive &&
      activeFocusRef.current === focus &&
      focus.epoch === capturedFocusEpoch &&
      mountedRef.current &&
      ownerRef.current === capturedOwner &&
      generationRef.current === generation
    );
    if (!canCommit()) return () => {};
    setLoadingOwner(hasCachedData ? null : capturedOwner);
    setInitialErrorOwner(null);
    setRefreshErrorOwner(null);
    let alive = true;
    void Promise.all([
      listMeasurements(capturedOwner, 52),
      listProgressPhotos(capturedOwner),
      getInsights('week', capturedOwner),
    ]).then(([measurements, photos, insights]) => {
      if (!alive || !canCommit()) return;
      setSnapshot({ ownerId: capturedOwner, referenceTime: Date.now(), measurements, photos, insights });
    }).catch(() => {
      if (!alive || !canCommit()) return;
      if (hasCachedData) setRefreshErrorOwner(capturedOwner);
      else setInitialErrorOwner(capturedOwner);
    }).finally(() => {
      if (!alive || !canCommit()) return;
      setLoadingOwner(null);
    });
    return () => {
      alive = false;
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [ownerId]);

  useFocusEffect(useCallback(() => {
    const focus: FocusLease = { epoch: ++focusEpochRef.current, alive: true };
    activeFocusRef.current = focus;
    const cancelLoad = load(focus);
    return () => {
      focus.alive = false;
      cancelLoad();
      if (activeFocusRef.current === focus) activeFocusRef.current = null;
      generationRef.current += 1;
    };
  }, [load]));

  const current = snapshot?.ownerId === ownerId ? snapshot : null;
  const loading = !!ownerId && loadingOwner === ownerId && !current;
  const initialFailed = !!ownerId && initialErrorOwner === ownerId && !current;
  const refreshFailed = !!ownerId && refreshErrorOwner === ownerId && !!current;
  const latest = current?.measurements.reduce<BodyMeasurement | undefined>((winner, item) =>
    !winner || new Date(item.recordedAt).getTime() > new Date(winner.recordedAt).getTime() ? item : winner,
  undefined);
  const sharePreparing = sharePreparingState?.ownerId === ownerId && sharePreparingState.ownerToken === ownerToken;
  const shareError = shareErrorState?.ownerId === ownerId && shareErrorState.ownerToken === ownerToken
    ? shareErrorState.message
    : null;

  const retry = () => { load(); };
  const saveMeasurement = async (input: AddMeasurementInput) => {
    const capturedOwner = sheetState?.token === ownerToken ? sheetState.ownerId : null;
    if (!capturedOwner || capturedOwner !== ownerRef.current) throw new Error('Account changed.');
    await addMeasurement(input, capturedOwner);
    if (capturedOwner !== ownerRef.current) return;
    setSheetState(null);
    load();
  };

  const openShareStudio = async () => {
    const capturedFocus = activeFocusRef.current;
    if (!current || !ownerId || !capturedFocus?.alive || sharePrepareLeaseRef.current) return;
    const capturedOwner = ownerId;
    const capturedOwnerToken = ownerToken;
    const lease = Symbol(capturedOwner);
    sharePrepareLeaseRef.current = lease;
    setSharePreparingState({ ownerId: capturedOwner, ownerToken: capturedOwnerToken, lease });
    setShareErrorState(null);
    try {
      const shareInsights = await getInsights(trendPeriod, capturedOwner);
      if (
        !mountedRef.current ||
        sharePrepareLeaseRef.current !== lease ||
        ownerRef.current !== capturedOwner ||
        !capturedFocus.alive ||
        activeFocusRef.current !== capturedFocus
      ) return;
      const prepared = await prepareProgressShareSnapshot(progressSnapshotInput(
        capturedOwner,
        trendPeriod,
        new Date(),
        shareInsights,
        latest,
        feedShare.available ? current.photos : [],
      ));
      if (
        !mountedRef.current ||
        sharePrepareLeaseRef.current !== lease ||
        ownerRef.current !== capturedOwner ||
        capturedOwnerToken !== ownerToken ||
        !capturedFocus.alive ||
        activeFocusRef.current !== capturedFocus
      ) return;
      setShareSession({ ownerId: capturedOwner, ownerToken: capturedOwnerToken, snapshot: prepared });
    } catch {
      if (mountedRef.current && sharePrepareLeaseRef.current === lease && ownerRef.current === capturedOwner) {
        setShareErrorState({ ownerId: capturedOwner, ownerToken: capturedOwnerToken, message: 'Your progress share couldn’t open. Try again.' });
      }
    } finally {
      if (sharePrepareLeaseRef.current === lease) sharePrepareLeaseRef.current = null;
      if (mountedRef.current) setSharePreparingState((currentState) => currentState?.lease === lease ? null : currentState);
    }
  };

  const closeShareStudio = () => {
    const operation = shareOperationRef.current;
    if (operation) clearProgressPublishArtifacts(operation.ownerId, operation.operationId);
    shareOperationRef.current = null;
    sharePrepareLeaseRef.current = null;
    mountedSharePreviewRef.current = null;
    setPreviewReadiness(null);
    setSharePreparingState(null);
    setShareSession(null);
    setShareErrorState(null);
  };

  const publishReviewedProgress = async (draft: ShareStudioResult) => {
    const active = shareSession;
    if (!active || active.ownerId !== ownerRef.current || active.ownerToken !== ownerToken) {
      throw new Error('Account changed.');
    }
    shareOperationRef.current = { ownerId: active.ownerId, operationId: draft.operationId };
    await publishProgressPost({ snapshot: active.snapshot, draft }, {
      captureCard: async (model, options) => {
        const fingerprint = progressShareRenderModelFingerprint(model);
        const mountedPreview = mountedSharePreviewRef.current;
        const readiness = previewReadiness;
        if (!shareCardRef.current || active.ownerId !== ownerRef.current || active.ownerToken !== ownerToken) {
          throw new Error('Account changed.');
        }
        if (!mountedPreview || mountedPreview.ownerId !== active.ownerId || mountedPreview.ownerToken !== active.ownerToken ||
          mountedPreview.fingerprint !== fingerprint || readiness?.ownerId !== active.ownerId ||
          readiness.ownerToken !== active.ownerToken || readiness.fingerprint !== fingerprint || readiness.status !== 'ready') {
          throw new Error('The reviewed progress preview is not ready. Change media and try again.');
        }
        return captureRef(shareCardRef, {
          format: options.format,
          quality: options.quality,
          result: 'base64',
          width: options.width,
          height: options.height,
        });
      },
    });
    if (active.ownerId !== ownerRef.current || active.ownerToken !== ownerToken) throw new Error('Account changed.');
    if (draft.media.kind === 'photo') await draft.media.release().catch(() => {});
    shareOperationRef.current = null;
    mountedSharePreviewRef.current = null;
    setPreviewReadiness(null);
    setShareSession(null);
    Alert.alert('Shared to your feed', 'Your progress card is now on your feed.');
  };

  const renderProgressPreview = (state: ShareStudioPreviewState) => {
    if (!shareSession) return null;
    const model = createProgressShareRenderModel(shareSession.snapshot, {
      context: state.context,
      caption: state.caption,
      media: state.media,
    });
    const fingerprint = progressShareRenderModelFingerprint(model);
    mountedSharePreviewRef.current = { ownerId: shareSession.ownerId, ownerToken: shareSession.ownerToken, fingerprint };
    return (
      <View ref={shareCardRef} collapsable={false} style={styles.shareCardCapture}>
        <ProgressShareCard
          model={model}
          onMediaStateChange={(state) => {
            if (shareSession.ownerId !== ownerRef.current || shareSession.ownerToken !== ownerToken) return;
            setPreviewReadiness({ ...state, ownerId: shareSession.ownerId, ownerToken: shareSession.ownerToken });
          }}
        />
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, spacing.md), paddingBottom: Math.max(insets.bottom, spacing.xxl) + 72 }]}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>YOUR JOURNEY</Text>
          <Text accessibilityRole="header" style={styles.title}>Progress</Text>
        </View>
        <JourneyTabs active="progress" />

        {loading ? (
          <View accessibilityRole="progressbar" accessibilityLabel="Loading journey progress" style={styles.loader}>
            <ActivityIndicator color={theme.ink.action} />
            <Text style={styles.loadingText}>Loading your progress…</Text>
          </View>
        ) : initialFailed ? (
          <View accessibilityRole="alert" accessibilityLabel="Journey progress failed to load" style={styles.errorCard}>
            <Text style={styles.errorText}>{INITIAL_ERROR}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry loading journey progress" onPress={retry} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable>
          </View>
        ) : current ? (
          <>
            {refreshFailed ? (
              <View accessibilityRole="alert" accessibilityLabel="Journey progress refresh failed" style={styles.notice}>
                <Text style={styles.noticeText}>{REFRESH_ERROR}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Retry refreshing journey progress" onPress={retry} style={styles.noticeRetry}><Text style={styles.retryText}>Retry</Text></Pressable>
              </View>
            ) : null}

            <View style={styles.summary}>
              <Text style={styles.sectionTitle}>Consistency this week</Text>
              <View style={styles.metrics}>
                <Metric label="Workouts" value={String(current.insights.workouts)} styles={styles} />
                <Metric label="Active time" value={activeTime(current.insights.activeSeconds)} styles={styles} />
                <Metric label="Completed tasks" value={String(current.insights.tasksDone)} styles={styles} />
              </View>
            </View>

            <Text style={styles.privateLabel}>PRIVATE BODY PROGRESS</Text>
            {latest ? (
              <View style={styles.currentCard}>
                <View style={styles.currentMetric}><Text style={styles.metricLabel}>Current weight</Text><Text style={styles.currentValue}>{latest.weightKg.toFixed(1)} kg</Text></View>
                <View style={styles.currentMetric}><Text style={styles.metricLabel}>BMI</Text><Text style={styles.currentValue}>{calculateBmi(latest.weightKg, latest.heightCm).toFixed(1)}</Text></View>
                <Text style={styles.lastCheckIn}>Last check-in · {formattedDate(latest.recordedAt)}</Text>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No body check-ins yet</Text>
                <Text style={styles.emptyText}>Add your weight and height to start a private progress record.</Text>
              </View>
            )}
            <WeightTrendChart measurements={current.measurements} now={current.referenceTime} period={trendPeriod} onPeriodChange={setTrendPeriod} />
            <Pressable accessibilityRole="button" accessibilityLabel="Add body check-in" onPress={() => ownerId && setSheetState({ ownerId, token: ownerToken })} style={styles.checkInButton}><Text style={styles.checkInButtonText}>{latest ? 'Add body check-in' : 'Start body check-in'}</Text></Pressable>
            <ProgressPhotoVault photos={current.photos} expectedOwnerId={current.ownerId} onSaved={() => load()} />
            <View style={styles.shareSection}>
              <Text style={styles.shareTitle}>Share your progress</Text>
              <Text style={styles.shareCopy}>Review a 4:5 progress card, choose a selfie or photo, then decide who sees it.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share progress"
                accessibilityHint="Opens Share Studio without posting"
                accessibilityState={{ disabled: sharePreparing }}
                disabled={sharePreparing}
                onPress={openShareStudio}
                style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
              >
                {sharePreparing ? <ActivityIndicator color={theme.ink.inverse} /> : null}
                <Text style={styles.shareButtonText}>{sharePreparing ? 'Preparing preview…' : 'Share progress'}</Text>
              </Pressable>
              {shareError ? <Text accessibilityRole="alert" style={styles.shareError}>{shareError}</Text> : null}
            </View>
          </>
        ) : null}
      </ScrollView>
      {!!ownerId && sheetState?.ownerId === ownerId && sheetState.token === ownerToken ? (
        <BodyCheckInSheet
          visible
          latestHeightCm={latest?.heightCm}
          onCancel={() => setSheetState(null)}
          onSave={saveMeasurement}
        />
      ) : null}
      {!!ownerId && shareSession?.ownerId === ownerId && shareSession.ownerToken === ownerToken ? (
        <ShareStudio
          visible
          expectedOwnerId={ownerId}
          context={shareSession.snapshot.context}
          defaultCaption=""
          unavailableReason={feedShare.reason}
          destinationPreviewAspectRatio={() => PROGRESS_SHARE_ASPECT_RATIO}
          destinationPreviewFingerprint={(state) => progressShareRenderModelFingerprint(createProgressShareRenderModel(shareSession.snapshot, {
            context: state.context,
            caption: state.caption,
            media: state.media,
          }))}
          destinationPreviewReadiness={previewReadiness?.ownerId === ownerId && previewReadiness.ownerToken === ownerToken
            ? previewReadiness
            : null}
          renderDestinationPreview={renderProgressPreview}
          onContinue={publishReviewedProgress}
          onCancel={closeShareStudio}
        />
      ) : null}
    </View>
  );
}

function Metric({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface.canvas },
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.lg },
  header: { minHeight: 64, justifyContent: 'center' },
  eyebrow: { color: theme.ink.muted, fontFamily: font.bold, fontSize: 10, letterSpacing: 1.4 },
  title: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 26, lineHeight: 32 },
  loader: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 13 },
  errorCard: { marginTop: spacing.xxl, borderWidth: 1, borderColor: theme.border.danger, backgroundColor: theme.status.dangerSoft, borderRadius: 16, padding: spacing.lg },
  errorText: { color: theme.ink.primary, fontFamily: font.medium, fontSize: 14, lineHeight: 20 },
  retry: { minHeight: 48, marginTop: spacing.md, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: 12, backgroundColor: theme.ink.action },
  retryText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 13 },
  notice: { marginTop: spacing.lg, borderWidth: 1, borderColor: theme.border.danger, backgroundColor: theme.surface.card, borderRadius: 14, padding: spacing.md },
  noticeText: { color: theme.ink.secondary, fontFamily: font.medium, fontSize: 13, lineHeight: 19 },
  noticeRetry: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', marginTop: spacing.xs, paddingHorizontal: spacing.md, borderRadius: 10, backgroundColor: theme.ink.action },
  summary: { marginTop: spacing.xxl },
  sectionTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 20 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  metric: { flexGrow: 1, flexBasis: 120, minHeight: 78, justifyContent: 'center', padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card },
  metricValue: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 20 },
  metricLabel: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 12, lineHeight: 17, marginTop: spacing.xs },
  privateLabel: { color: theme.ink.action, fontFamily: font.bold, fontSize: 10, letterSpacing: 1.3, marginTop: spacing.section },
  currentCard: { marginTop: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card, borderRadius: 18, padding: spacing.lg },
  currentMetric: { minWidth: 128, flexGrow: 1 },
  currentValue: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 28, marginTop: spacing.xs },
  lastCheckIn: { width: '100%', color: theme.ink.muted, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
  emptyCard: { marginTop: spacing.sm, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card, borderRadius: 18, padding: spacing.lg },
  emptyTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 16 },
  emptyText: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  checkInButton: { minHeight: 48, marginTop: spacing.md, borderRadius: 12, backgroundColor: theme.ink.action, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  checkInButtonText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 14 },
  shareSection: { marginTop: spacing.section, borderTopWidth: 1, borderTopColor: theme.border.subtle, paddingTop: spacing.xl },
  shareTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 20, lineHeight: 26 },
  shareCopy: { color: theme.ink.secondary, fontFamily: font.regular, fontSize: 13.5, lineHeight: 20, marginTop: spacing.xs },
  shareButton: { minHeight: 48, marginTop: spacing.md, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: theme.ink.action, paddingHorizontal: spacing.lg },
  shareButtonText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 14 },
  shareError: { color: theme.status.danger, fontFamily: font.medium, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  shareCardCapture: { width: '100%', aspectRatio: PROGRESS_SHARE_ASPECT_RATIO, overflow: 'hidden' },
  pressed: { opacity: 0.72 },
});
