import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import Ionicons from '@expo/vector-icons/Ionicons';
import { createPost } from '../feed/api';
import { uploadPostImage } from '../feed/uploadPostImage';
import { saveImageToMemories } from '../memories/api';
import { supabase } from '../lib/supabase';
import {
  isProofActionBusy,
  safeProofActionMessage,
  shareAvailability,
  type ProofActionToken,
} from '../entry/proofActions';
import {
  type PendingProofActionV1,
} from '../entry/pendingProofActions';
import {
  DEFAULT_PROOF_PRIVACY,
  sanitizeProofParam,
  type ProofPrivacy,
} from '../entry/proofPrivacy';
import {
  buildExternalProofExport,
  buildFeedProofExport,
  buildMemoryProofExport,
  buildPhoneProofExport,
  type ProofExport,
  type ProofExportInput,
  type ProofExportOptIns,
} from '../entry/proofExport';
import { colors, font, radius, spacing } from '../ui/theme';
import {
  useProofActionOrchestrator,
} from '../entry/useProofActionOrchestrator';
import { withProofLoadTimeout } from '../entry/proofLoadTimeout';
import { createProofRetryGuard } from '../entry/proofRetryGuard';
import {
  buildProofCardSummary,
  ProofCaptureCard,
  type ProofCaptureRendererContext,
} from '../entry/ProofCaptureCard';

type ProofFormat = 'portrait' | 'square' | 'landscape';

export default function WinCard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    location?: string | string[];
    route?: string | string[];
    amount?: string | string[];
    buddyName?: string | string[];
  }>();
  const proofLocation = sanitizeProofParam(params.location);
  const proofRoute = sanitizeProofParam(params.route);
  const proofAmount = sanitizeProofParam(params.amount);
  const proofBuddyName = sanitizeProofParam(params.buddyName);
  const {
    stats,
    loadError,
    actionState,
    dispatchAction,
    pendingActions,
    ownerIdRef,
    captureQueueRef,
    mountedRef,
    setActionOwner,
    loadOwnerView,
    retryLoad,
    markLoadError,
    beginAction,
    endAction,
    isCurrentAction,
    mutateForToken,
    journalDurableAction,
    confirmDurableAction,
    retainAmbiguous,
    discardPending,
    requireCurrentActionOwner,
  } = useProofActionOrchestrator();
  const [format, setFormat] = useState<ProofFormat>('portrait');
  const [privacy, setPrivacy] = useState<ProofPrivacy>({ ...DEFAULT_PROOF_PRIVACY });
  const [selectedCaptureContext, setSelectedCaptureContext] =
    useState<ProofCaptureRendererContext | null>(null);
  const cardRef = useRef<View>(null);
  const retryGuardRef = useRef(createProofRetryGuard());
  // Fonts (Inter + Anton) are loaded globally in the root layout.

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const initialToken = retryGuardRef.current.begin(ownerIdRef.current);
      const isInitialCurrent = () => active && retryGuardRef.current.isCurrent(
        initialToken,
        ownerIdRef.current,
        mountedRef.current,
      );
      void withProofLoadTimeout(supabase.auth.getUser()).then((result) => {
        if (!isInitialCurrent()) return;
        if (result.status === 'timeout') {
          markLoadError();
          return;
        }
        const ownerId = result.value.data.user?.id ?? null;
        setActionOwner(ownerId);
        if (active && ownerId) void loadOwnerView(ownerId);
        else if (active) markLoadError();
      }).catch(() => {
        if (isInitialCurrent()) markLoadError();
      });
      return () => {
        active = false;
        retryGuardRef.current.invalidate();
        setActionOwner(null);
        setSelectedCaptureContext(null);
      };
    // The orchestrator owns mutable session refs; this focus lifecycle must not
    // restart when its render-local facade is recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  useEffect(() => {
    mountedRef.current = true;
    const retryGuard = retryGuardRef.current;
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const ownerId = session?.user.id ?? null;
      if (ownerIdRef.current === ownerId) return;
      retryGuard.invalidate();
      setActionOwner(ownerId);
      setSelectedCaptureContext(null);
      if (ownerId) void loadOwnerView(ownerId);
    });
    return () => {
      mountedRef.current = false;
      retryGuard.invalidate();
      authListener.subscription.unsubscribe();
    };
  // The auth subscription is intentionally installed once; current ownership
  // is read from the orchestrator's refs inside the callback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!stats) {
    return (
      <View
        style={[
          styles.stateScreen,
          { paddingTop: Math.max(insets.top, 4), paddingBottom: Math.max(insets.bottom, 18) },
        ]}
      >
        <ScreenHeader onBack={goBack} />
        <View style={styles.center}>
          {loadError ? (
            <>
              <Ionicons name="cloud-offline-outline" size={32} color={colors.textSecondary} />
              <Text accessibilityRole="header" style={styles.stateTitle}>
                Could not load your proof
              </Text>
              <Text style={styles.stateMessage}>Check your connection, then try again.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading Daily Proof"
                style={styles.retryButton}
                onPress={() => void retryProofLoad()}
              >
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text accessibilityLiveRegion="polite" style={styles.stateMessage}>
                Preparing your Daily Proof…
              </Text>
            </>
          )}
        </View>
      </View>
    );
  }

  const message =
    stats.streak > 0
      ? `${stats.streak}-day streak on AccountAbility. Achieve consistency.`
      : `Building better habits with AccountAbility - ${stats.weekWorkouts} workouts this week.`;
  const proofInput: ProofExportInput = {
    brand: 'AccountAbility',
    headline: 'I showed up today.',
    format,
    metrics: {
      workouts: stats.weekWorkouts,
      activities: stats.weekActivities,
      streakDays: stats.streak,
    },
    locationLabel: proofLocation,
    routeImage: undefined,
    amountDisplay: proofAmount,
    buddyDisplayNames: proofBuddyName ? [proofBuddyName] : undefined,
    buddyPortraitImages: undefined,
  };
  const proofOptIns: ProofExportOptIns = {
    location: !privacy.hideLocation,
    route: !privacy.hideRoute,
    amount: !privacy.hideAmounts,
    buddyNames: !privacy.hideBuddyNames,
    buddyPortraits: !privacy.hideBuddyPortraits,
  };
  const captureContext =
    selectedCaptureContext ??
    unavailableRendererContext(buildExternalProofExport(proofInput, proofOptIns));
  const cardModel = captureContext.dto;
  const proofCardSummary = buildProofCardSummary(cardModel);

  async function captureCard(result: 'base64' | 'tmpfile'): Promise<string | null> {
    if (Platform.OS === 'web' || !cardRef.current) return null;
    try {
      return await captureRef(cardRef, { format: 'png', quality: 0.95, result });
    } catch {
      return null;
    }
  }

  async function captureDestination(
    build: (input: ProofExportInput, optIns: ProofExportOptIns) => ProofExport,
    result: 'base64' | 'tmpfile',
    token: ProofActionToken,
  ): Promise<string | null> {
    return captureQueueRef.current.run(async () => {
      if (!isCurrentAction(token)) return null;
      try {
        const context = unavailableRendererContext(build(proofInput, proofOptIns));
        setSelectedCaptureContext(context);
        await nextPaint();
        if (!isCurrentAction(token)) return null;
        return await captureCard(result);
      } finally {
        if (mountedRef.current) {
          setSelectedCaptureContext(null);
        }
      }
    });
  }

  async function onShareToFeed() {
    const token = beginAction('post-feed');
    if (!token) return;
    let pending: PendingProofActionV1 | null = null;
    let dispatched = false;
    try {
      const base64 = await captureDestination(
        buildFeedProofExport,
        'base64',
        token,
      );
      if (!base64) {
        throw new Error('Could not prepare the Daily Proof image. Please try again.');
      }
      if (!await requireCurrentActionOwner(token)) throw new Error('Account changed.');
      const imageUrl = await uploadPostImage(base64, 'png');
      if (!await requireCurrentActionOwner(token)) throw new Error('Account changed.');
      pending = await journalDurableAction(token, 'post-feed', base64, message);
      if (!await requireCurrentActionOwner(token)) {
        await confirmDurableAction(pending);
        pending = null;
        throw new Error('Account changed.');
      }
      dispatched = true;
      if (!await requireCurrentActionOwner(token)) throw new Error('Account changed.');
      await createPost(message, imageUrl);
      const ownerStayedCurrent = await requireCurrentActionOwner(token);
      await confirmDurableAction(pending);
      if (!ownerStayedCurrent) return;
      mutateForToken(token, () => {
        dispatchAction({ type: 'success', action: 'post-feed' });
        Alert.alert('Shared to your feed', 'Your Daily Proof is now on your feed.');
      });
    } catch {
      if (pending && dispatched) {
        retainAmbiguous(token, pending, 'The post may have completed. Check Feed before trying again.');
      } else {
        mutateForToken(token, () => {
          dispatchAction({ type: 'error', action: 'post-feed', message: safeProofActionMessage('dispatch') });
          Alert.alert('Could not post Daily Proof', 'Nothing was posted. Please try again.');
        });
      }
    } finally {
      endAction(token);
    }
  }

  async function onShareExternally() {
    const token = beginAction('share-external');
    if (!token) return;
    try {
      const uri = await captureDestination(
        buildExternalProofExport,
        'tmpfile',
        token,
      );
      if (!uri) {
        mutateForToken(token, () => {
          dispatchAction({ type: 'error', action: 'share-external', message: safeProofActionMessage('capture') });
          Alert.alert('Could not prepare image', 'Please try again. Your Daily Proof was not shared.');
        });
        return;
      }
      if (!await requireCurrentActionOwner(token)) return;
      const availability = shareAvailability(
        Platform.OS,
        Platform.OS !== 'web' && await Sharing.isAvailableAsync(),
      );
      if (!await requireCurrentActionOwner(token)) return;
      if (availability.status === 'unavailable') {
        mutateForToken(token, () => {
          dispatchAction({ type: 'unavailable', action: 'share-external', message: availability.message });
          Alert.alert('Image sharing unavailable', availability.message);
        });
        return;
      }
      if (!await requireCurrentActionOwner(token)) return;
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Daily Proof' });
      if (!await requireCurrentActionOwner(token)) return;
      mutateForToken(token, () => dispatchAction({ type: 'success', action: 'share-external' }));
    } catch {
      mutateForToken(token, () => {
        dispatchAction({ type: 'error', action: 'share-external', message: safeProofActionMessage('dispatch') });
        Alert.alert('Could not share image', 'Your Daily Proof was not shared. Please try again.');
      });
    } finally {
      endAction(token);
    }
  }

  async function onSavePhone() {
    const token = beginAction('save-phone');
    if (!token) return;
    try {
      const uri = await captureDestination(
        buildPhoneProofExport,
        'tmpfile',
        token,
      );
      if (!uri) throw new Error('Could not prepare the proof image.');
      if (!await requireCurrentActionOwner(token)) return;
      const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (!await requireCurrentActionOwner(token)) return;
      if (!permission.granted) {
        mutateForToken(token, () => {
          dispatchAction({ type: 'error', action: 'save-phone', message: safeProofActionMessage('permission') });
          Alert.alert('Photo access needed', safeProofActionMessage('permission'));
        });
        return;
      }
      if (!await requireCurrentActionOwner(token)) return;
      await MediaLibrary.createAssetAsync(uri);
      if (!await requireCurrentActionOwner(token)) return;
      mutateForToken(token, () => {
        dispatchAction({ type: 'success', action: 'save-phone' });
        Alert.alert('Saved to phone', 'Your Daily Proof is in your photo library.');
      });
    } catch {
      mutateForToken(token, () => {
        dispatchAction({ type: 'error', action: 'save-phone', message: safeProofActionMessage('dispatch') });
        Alert.alert('Could not save', 'The image was not saved to your phone. Please try again.');
      });
    } finally {
      endAction(token);
    }
  }

  async function onSaveMemories() {
    const token = beginAction('save-memories');
    if (!token) return;
    let pending: PendingProofActionV1 | null = null;
    let dispatched = false;
    try {
      const uri = await captureDestination(
        buildMemoryProofExport,
        'tmpfile',
        token,
      );
      if (!uri) throw new Error('Could not prepare the proof image.');
      if (!await requireCurrentActionOwner(token)) throw new Error('Account changed.');
      pending = await journalDurableAction(token, 'save-memories', uri, message, true);
      if (!await requireCurrentActionOwner(token)) {
        await confirmDurableAction(pending);
        pending = null;
        throw new Error('Account changed.');
      }
      dispatched = true;
      if (!await requireCurrentActionOwner(token)) throw new Error('Account changed.');
      await saveImageToMemories(uri);
      const ownerStayedCurrent = await requireCurrentActionOwner(token);
      await confirmDurableAction(pending);
      if (!ownerStayedCurrent) return;
      mutateForToken(token, () => {
        dispatchAction({ type: 'success', action: 'save-memories' });
        Alert.alert('Saved to Memories', 'You can revisit this Daily Proof anytime.');
      });
    } catch {
      if (pending && dispatched) {
        retainAmbiguous(token, pending, 'The save may have completed. Check Memories before doing anything else.');
      } else {
        mutateForToken(token, () => {
          dispatchAction({ type: 'error', action: 'save-memories', message: safeProofActionMessage('dispatch') });
          Alert.alert('Could not save', 'Nothing was sent to Memories. Please try again.');
        });
      }
    } finally {
      endAction(token);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.screen,
        { paddingTop: Math.max(insets.top, 4), paddingBottom: Math.max(insets.bottom, 18) },
      ]}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
    >
      <ScreenHeader onBack={goBack} />
      <View
        ref={cardRef}
        collapsable={false}
        accessible
        accessibilityRole="image"
        accessibilityLabel={proofCardSummary}
        style={[
          styles.cardWrap,
          cardModel.format === 'portrait' && styles.portrait,
          cardModel.format === 'square' && styles.square,
          cardModel.format === 'landscape' && styles.landscape,
        ]}
      >
        <ProofCaptureCard context={captureContext} />
      </View>

      <View style={styles.formatRow} accessibilityRole="radiogroup">
        {(['portrait', 'square', 'landscape'] as const).map((item) => (
          <Pressable
            key={item}
            onPress={() => setFormat(item)}
            style={[styles.formatChip, format === item && styles.formatChipActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: format === item }}
          >
            <Text style={[styles.formatText, format === item && styles.formatTextActive]}>
              {item[0].toUpperCase() + item.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {proofLocation || proofRoute || proofAmount || proofBuddyName ? (
        <View style={styles.privacyPanel}>
          <View style={styles.privacyHeading}>
            <Text style={styles.privacyTitle}>Proof privacy</Text>
            <Text style={styles.privacyHelp} accessibilityLiveRegion="polite">
              Switch on to remove a detail from the shared image.
            </Text>
          </View>
          <View style={styles.privacyControls}>
          {proofLocation ? (
            <ToggleRow
              icon="location-outline"
              label="Hide location"
              value={privacy.hideLocation}
              onPress={() => togglePrivacy('hideLocation')}
            />
          ) : null}
          {proofRoute ? (
            <ToggleRow
              icon="map-outline"
              label="Hide route"
              value={privacy.hideRoute}
              onPress={() => togglePrivacy('hideRoute')}
            />
          ) : null}
          {proofAmount ? (
            <ToggleRow
              icon="cash-outline"
              label="Hide amounts"
              value={privacy.hideAmounts}
              onPress={() => togglePrivacy('hideAmounts')}
            />
          ) : null}
          {proofBuddyName ? (
            <ToggleRow
              icon="people-outline"
              label="Hide buddy names"
              value={privacy.hideBuddyNames}
              onPress={() => togglePrivacy('hideBuddyNames')}
            />
          ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <ProofAction icon="people-outline" label="Post to Feed" onPress={onShareToFeed} busy={isProofActionBusy(actionState, 'post-feed')} disabled={actionState['post-feed'].status === 'unresolved' || actionState['post-feed'].status === 'ambiguous'} />
        <ProofAction icon="share-social-outline" label="Share outside app" onPress={onShareExternally} busy={isProofActionBusy(actionState, 'share-external')} />
        {Platform.OS !== 'web' ? <ProofAction icon="download-outline" label="Save to phone" onPress={onSavePhone} busy={isProofActionBusy(actionState, 'save-phone')} /> : null}
        <ProofAction icon="bookmark-outline" label="Save to Memories" onPress={onSaveMemories} busy={isProofActionBusy(actionState, 'save-memories')} disabled={actionState['save-memories'].status === 'unresolved' || actionState['save-memories'].status === 'ambiguous'} />
      </View>
      {pendingActions.map((entry) => (
        <View key={entry.operationId} style={styles.pendingPanel} accessibilityLiveRegion="polite">
          <Text style={styles.pendingText}>
            {entry.action === 'save-memories'
              ? 'A Memories save is unresolved.'
              : 'A Feed post is unresolved.'}
          </Text>
          <View style={styles.pendingButtons}>
            <Pressable
              style={styles.pendingButton}
              accessibilityRole="button"
              onPress={() => router.push(entry.action === 'save-memories' ? '/memories' : '/(app)')}
            >
              <Text style={styles.pendingButtonText}>
                {entry.action === 'save-memories' ? 'Check Memories' : 'Check Feed'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.pendingButton}
              accessibilityRole="button"
              onPress={() => void discardPending(entry)}
            >
              <Text style={styles.pendingButtonText}>Discard pending</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );

  function togglePrivacy(key: keyof ProofPrivacy) {
    setPrivacy((current) => ({ ...current, [key]: !current[key] }));
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function retryProofLoad() {
    if (ownerIdRef.current) {
      await retryLoad();
      return;
    }
    const retryToken = retryGuardRef.current.begin(ownerIdRef.current);
    const isRetryCurrent = () => retryGuardRef.current.isCurrent(
      retryToken,
      ownerIdRef.current,
      mountedRef.current,
    );
    try {
      const result = await withProofLoadTimeout(supabase.auth.getUser());
      if (!isRetryCurrent()) return;
      if (result.status === 'timeout') {
        markLoadError();
        return;
      }
      const ownerId = result.value.data.user?.id ?? null;
      if (!ownerId) {
        markLoadError();
        return;
      }
      setActionOwner(ownerId);
      await loadOwnerView(ownerId);
    } catch {
      if (isRetryCurrent()) markLoadError();
    }
  }
}

function ScreenHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.screenHeader}>
      <Pressable
        style={styles.backButton}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.screenTitle}>Share proof</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function ToggleRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={`${label.replace(/^Hide /, '')} ${value ? 'hidden' : 'shown'}`}
      accessibilityHint="Double tap to change whether this detail appears in the shared image"
    >
      <Ionicons name={icon} size={19} color={colors.textSecondary} />
      <Text style={styles.toggleLabel}>{label.replace(/^Hide /, '')}</Text>
      <View style={[styles.switchTrack, value && styles.switchTrackOn]}>
        <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
      </View>
    </Pressable>
  );
}

function ProofAction({ icon, label, onPress, busy, disabled }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [styles.actionRow, pressed && styles.pressed, disabled && styles.disabled]} onPress={onPress} disabled={busy || disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy: !!busy, disabled: !!disabled || !!busy }}>
      {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={icon} size={21} color={colors.primary} />}
      <Text style={styles.actionLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

function unavailableRendererContext(dto: ProofExport): ProofCaptureRendererContext {
  return {
    dto,
    backgroundImage: null,
    routeImages: [],
    buddyPortraitImages: [],
    resolve() {
      throw new Error('Render asset unavailable');
    },
  };
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 18, gap: 8, backgroundColor: '#F8F5EE' },
  stateScreen: { flex: 1, paddingHorizontal: 14, backgroundColor: '#F8F5EE' },
  screenHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  screenTitle: { color: colors.text, fontFamily: font.extrabold, fontSize: 18 },
  headerSpacer: { width: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: spacing.lg },
  stateTitle: { color: colors.text, fontFamily: font.extrabold, fontSize: 20, textAlign: 'center' },
  stateMessage: { color: colors.textMuted, fontFamily: font.regular, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  retryButton: { minHeight: 48, minWidth: 128, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primary, paddingHorizontal: spacing.lg },
  retryText: { color: '#FFFFFF', fontFamily: font.semibold, fontSize: 15 },
  cardWrap: {
    borderRadius: 24,
    overflow: 'hidden',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  portrait: { aspectRatio: 0.95 },
  square: { aspectRatio: 1 },
  landscape: { aspectRatio: 16 / 9 },
  formatRow: { flexDirection: 'row', alignSelf: 'center', width: '100%', maxWidth: 340, gap: 6 },
  formatChip: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF' },
  formatChipActive: { borderColor: colors.primary, backgroundColor: '#EEF4FF' },
  formatText: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 13 },
  formatTextActive: { color: colors.primary },
  privacyPanel: { alignSelf: 'center', width: '100%', maxWidth: 340, borderRadius: radius.md, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5DFD4', overflow: 'hidden' },
  privacyHeading: { paddingHorizontal: spacing.md, paddingVertical: 6, gap: 1, backgroundColor: '#F3F6FC' },
  privacyTitle: { color: colors.text, fontFamily: font.semibold, fontSize: 14 },
  privacyHelp: { color: colors.textMuted, fontFamily: font.regular, fontSize: 11, lineHeight: 14 },
  privacyControls: { flexDirection: 'row', flexWrap: 'wrap' },
  toggleRow: { width: '50%', minHeight: 44, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: '#E5DFD4' },
  toggleLabel: { flex: 1, color: colors.text, fontFamily: font.medium, fontSize: 13 },
  switchTrack: { width: 42, height: 24, padding: 2, borderRadius: 12, backgroundColor: '#CBD5E1' },
  switchTrackOn: { backgroundColor: colors.primary },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  switchThumbOn: { transform: [{ translateX: 18 }] },
  actions: { alignSelf: 'center', width: '100%', maxWidth: 340, borderRadius: radius.md, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5DFD4', overflow: 'hidden' },
  actionRow: { minHeight: 48, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5DFD4' },
  actionLabel: { flex: 1, color: colors.text, fontFamily: font.semibold, fontSize: 14 },
  pressed: { opacity: 0.62 },
  disabled: { opacity: 0.48 },
  pendingPanel: { alignSelf: 'center', width: '100%', maxWidth: 400, borderRadius: radius.md, backgroundColor: '#FFF7E6', borderWidth: 1, borderColor: '#F2C879', padding: spacing.md, gap: spacing.sm },
  pendingText: { color: colors.text, fontFamily: font.semibold, fontSize: 14 },
  pendingButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pendingButton: { minHeight: 44, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: spacing.md },
  pendingButtonText: { color: colors.primary, fontFamily: font.semibold, fontSize: 13 },
});
