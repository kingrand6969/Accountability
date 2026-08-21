import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { chooseProgressPhoto, type CapturedProgressPhoto, type ProgressPhotoSource } from '../progress/photoCapture';
import { postVisibilityCopy } from '../progress/visibility';
import { useAppTheme } from '../ui/AppThemeProvider';
import { createShareStudioStyles } from './ShareStudio.styles';
import { PostVisibilitySwitch } from './PostVisibilitySwitch';
import {
  createShareStudioResult,
  canonicalShareStudioContext,
  hasBodyStats,
  SHARE_CAPTION_LIMIT,
  type ShareStudioContext,
  type ShareStudioResult,
} from './shareStudioDraft';

export { SHARE_CAPTION_LIMIT, type ShareStudioContext, type ShareStudioResult } from './shareStudioDraft';

type MediaChoice = 'card' | 'selfie' | 'gallery';
export type ShareMediaCapabilities = Readonly<{ card: boolean; selfie: boolean; gallery: boolean }>;
export type ShareStudioPreviewState = Readonly<{
  context: ShareStudioContext;
  media: ShareStudioResult['media'];
  caption: string;
  showPublicly: boolean;
  includeBodyStats: boolean;
}>;
type Props = Readonly<{
  visible: boolean;
  expectedOwnerId: string;
  context: ShareStudioContext;
  defaultCaption?: string;
  onContinue: (result: ShareStudioResult) => void | Promise<void>;
  onCancel: () => void;
  choosePhoto?: (source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>;
  createOperationId?: () => string;
  mediaCapabilities?: Partial<ShareMediaCapabilities>;
  renderDestinationPreview?: (state: ShareStudioPreviewState) => ReactNode;
  destinationPreviewAspectRatio?: (state: ShareStudioPreviewState) => number;
  unavailableReason?: string | null;
}>;

const mediaOptions: readonly Readonly<{
  id: MediaChoice;
  label: string;
  detail: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}>[] = [
  { id: 'card', label: 'Card only', detail: 'Share your result without a new photo.', icon: 'stats-chart-outline' },
  { id: 'selfie', label: 'Take selfie', detail: 'Use the front camera for this share.', icon: 'camera-outline' },
  { id: 'gallery', label: 'Choose photo', detail: 'Choose one from your photo library.', icon: 'image-outline' },
];

export function resolveShareMediaCapabilities(
  platform: string,
  requested?: Partial<ShareMediaCapabilities>,
): ShareMediaCapabilities {
  const resolved = {
    card: requested?.card ?? true,
    selfie: requested?.selfie ?? platform !== 'web',
    gallery: requested?.gallery ?? true,
  };
  if (!resolved.card && !resolved.selfie && !resolved.gallery) {
    throw new Error('Share Studio needs at least one supported media option.');
  }
  return resolved;
}

export function ShareStudio(props: Props) {
  if (!props.visible) return null;
  if (props.unavailableReason) {
    return <UnavailableShareStudio reason={props.unavailableReason} onCancel={props.onCancel} />;
  }
  return <ShareStudioSession key={props.expectedOwnerId} {...props} />;
}

function UnavailableShareStudio({ reason, onCancel }: Readonly<{ reason: string; onCancel: () => void }>) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createShareStudioStyles(theme), [theme]);
  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} transparent={false}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back from Share Studio"
            onPress={onCancel}
            style={styles.headerAction}
          >
            <Ionicons name="chevron-back" size={25} color={theme.ink.primary} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>Share Studio</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.content}>
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
            {reason}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function ShareStudioSession({
  visible,
  expectedOwnerId,
  context,
  defaultCaption = '',
  onContinue,
  onCancel,
  choosePhoto = chooseProgressPhoto,
  createOperationId = Crypto.randomUUID,
  mediaCapabilities,
  renderDestinationPreview,
  destinationPreviewAspectRatio,
}: Props) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createShareStudioStyles(theme), [theme]);
  const capabilities = useMemo(
    () => resolveShareMediaCapabilities(Platform.OS, mediaCapabilities),
    [mediaCapabilities],
  );
  const availableMediaOptions = useMemo(
    () => mediaOptions.filter((option) => capabilities[option.id]),
    [capabilities],
  );
  const [choice, setChoice] = useState<MediaChoice>(availableMediaOptions[0].id);
  const [photo, setPhoto] = useState<CapturedProgressPhoto | null>(null);
  const [caption, setCaption] = useState(defaultCaption.slice(0, SHARE_CAPTION_LIMIT));
  const [showPublicly, setShowPublicly] = useState(false);
  const [includeBodyStats, setIncludeBodyStats] = useState(false);
  const [retryDraft, setRetryDraft] = useState<ShareStudioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const mounted = useRef(true);
  const ownerLease = useRef(Symbol(expectedOwnerId));
  const photoRef = useRef<CapturedProgressPhoto | null>(null);
  const pickerFlight = useRef(false);
  const continueFlight = useRef(false);
  const [operationId] = useState(createOperationId);
  const containsBodyStats = useMemo(() => hasBodyStats(context), [context]);
  const shareContext = useMemo(
    () => canonicalShareStudioContext(context, includeBodyStats),
    [context, includeBodyStats],
  );
  const draftLocked = retryDraft !== null;
  const mediaReady = choice === 'card' ? capabilities.card : photo !== null;
  const previewMedia = useMemo(
    () => selectedShareMedia(choice, photo),
    [choice, photo],
  );

  const releaseOwnedPhoto = useCallback(async () => {
    const owned = photoRef.current;
    photoRef.current = null;
    setPhoto(null);
    await safeRelease(owned);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const owned = photoRef.current;
      photoRef.current = null;
      void safeRelease(owned);
    };
  }, []);

  const selectMedia = useCallback(async (next: MediaChoice) => {
    if (picking || continuing || draftLocked || pickerFlight.current || !capabilities[next]) return;
    setError(null);
    if (next === 'card') {
      await releaseOwnedPhoto();
      if (mounted.current) setChoice('card');
      return;
    }
    const lease = ownerLease.current;
    pickerFlight.current = true;
    setPicking(true);
    const source: ProgressPhotoSource = next === 'selfie' ? 'front-camera' : 'gallery';
    try {
      const selected = await choosePhoto(source);
      if (!selected) return;
      if (!mounted.current || lease !== ownerLease.current) {
        await safeRelease(selected);
        return;
      }
      await releaseOwnedPhoto();
      if (!mounted.current || lease !== ownerLease.current) {
        await safeRelease(selected);
        return;
      }
      photoRef.current = selected;
      setPhoto(selected);
      setChoice(next);
    } catch (cause) {
      if (!mounted.current || lease !== ownerLease.current) return;
      setError(permissionMessage(cause));
    } finally {
      if (mounted.current && lease === ownerLease.current) {
        pickerFlight.current = false;
        setPicking(false);
      }
    }
  }, [capabilities, choosePhoto, continuing, draftLocked, picking, releaseOwnedPhoto]);

  const cancel = useCallback(() => {
    if (continuing || continueFlight.current) return;
    ownerLease.current = Symbol(expectedOwnerId);
    pickerFlight.current = false;
    setPicking(false);
    void releaseOwnedPhoto();
    onCancel();
  }, [continuing, expectedOwnerId, onCancel, releaseOwnedPhoto]);

  const proceed = useCallback(async () => {
    if (picking || continuing || !mediaReady || continueFlight.current) return;
    const lease = ownerLease.current;
    setError(null);
    try {
      const media = previewMedia;
      const result = retryDraft ?? createShareStudioResult({
        ownerId: expectedOwnerId,
        operationId,
        context: shareContext,
        caption,
        showPublicly,
        includeBodyStats,
        media,
      });
      if (!retryDraft) setRetryDraft(result);
      continueFlight.current = true;
      setContinuing(true);
      await onContinue(result);
      if (mounted.current && lease === ownerLease.current) {
        // A successful callback transfers ownership of its selected temporary file.
        if (result.media.kind === 'photo') {
          photoRef.current = null;
          setPhoto(null);
          setChoice(availableMediaOptions[0].id);
        }
        setRetryDraft(null);
      }
    } catch (cause) {
      if (mounted.current && lease === ownerLease.current) setError(messageOf(cause));
    } finally {
      if (mounted.current && lease === ownerLease.current) {
        continueFlight.current = false;
        setContinuing(false);
      }
    }
  }, [availableMediaOptions, caption, continuing, expectedOwnerId, includeBodyStats, mediaReady, onContinue, operationId, picking, previewMedia, retryDraft, shareContext, showPublicly]);

  const visibilityCopy = postVisibilityCopy(showPublicly);
  const previewState: ShareStudioPreviewState = {
    context: shareContext,
    media: previewMedia,
    caption,
    showPublicly,
    includeBodyStats,
  };
  const previewRatio = destinationPreviewAspectRatio?.(previewState);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cancel} transparent={false}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back from Share Studio"
            accessibilityHint="Closes Share Studio without continuing"
            accessibilityState={{ disabled: continuing }}
            disabled={continuing}
            onPress={cancel}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={25} color={theme.ink.primary} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>Share Studio</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          automaticallyAdjustKeyboardInsets
        >
          {renderDestinationPreview ? (
            <View testID="share-card-preview" style={[styles.preview, previewRatio ? { aspectRatio: previewRatio } : null]}>
              {renderDestinationPreview(previewState)}
            </View>
          ) : <View testID="share-card-preview" style={styles.preview}>
            {photo && choice !== 'card' ? (
              <Image
                source={{ uri: photo.uri }}
                style={styles.previewPhoto}
                resizeMode="cover"
                accessible
                accessibilityRole="image"
                accessibilityLabel={choice === 'selfie'
                  ? 'Selected selfie for share card preview'
                  : 'Selected photo for share card preview'}
                accessibilityIgnoresInvertColors
              />
            ) : null}
            <View testID="share-card-shade" style={[styles.previewShade, photo && choice !== 'card' ? styles.previewShadePhoto : null]}>
              <Text testID="share-card-date" numberOfLines={1} maxFontSizeMultiplier={1.5} style={styles.previewEyebrow}>{shareContext.date}</Text>
              <Text testID="share-card-title" numberOfLines={3} maxFontSizeMultiplier={1.5} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.previewTitle}>{shareContext.title}</Text>
              <View style={styles.metricRow}>
                {shareContext.metrics.map((metric) => (
                  <View key={`${metric.label}:${metric.value}`} style={styles.metric}>
                    <Text testID="share-card-metric-value" numberOfLines={1} maxFontSizeMultiplier={1.4} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.metricValue}>{metric.value}</Text>
                    <Text testID="share-card-metric-label" numberOfLines={1} maxFontSizeMultiplier={1.4} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.metricLabel}>{metric.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add to your card</Text>
            <Text style={styles.sectionCopy}>Choose how this share looks. A selected photo is used only for this share.</Text>
            <View accessibilityRole="radiogroup" style={styles.mediaOptions}>
              {availableMediaOptions.map((option) => {
                const selected = choice === option.id && (option.id === 'card' || photo !== null);
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityHint={option.detail}
                    accessibilityState={{ selected, disabled: picking || continuing || draftLocked }}
                    disabled={picking || continuing || draftLocked}
                    onPress={() => void selectMedia(option.id)}
                    style={({ pressed }) => [styles.mediaOption, selected && styles.mediaSelected, pressed && styles.pressed]}
                  >
                    <Ionicons name={option.icon} size={22} color={selected ? theme.ink.action : theme.ink.secondary} />
                    <View style={styles.mediaCopy}>
                      <Text style={styles.mediaLabel}>{option.label}{selected ? '  ✓' : ''}</Text>
                      <Text style={styles.mediaDetail}>{option.detail}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {picking ? <View style={styles.statusRow}><ActivityIndicator color={theme.ink.action} /><Text style={styles.statusText}>Opening photos…</Text></View> : null}
            {photo && choice !== 'card' ? <Text style={styles.privateNote}>Your original stays private. Only this derived share photo continues.</Text> : null}
          </View>

          <View style={styles.section}>
            <View style={styles.captionHeading}>
              <Text style={styles.sectionTitle}>Caption</Text>
              <Text style={styles.counter}>{caption.length}/{SHARE_CAPTION_LIMIT}</Text>
            </View>
            <TextInput
              accessibilityLabel="Add a caption"
              accessibilityHint={`Optional, up to ${SHARE_CAPTION_LIMIT} characters`}
              value={caption}
              onChangeText={setCaption}
              editable={!continuing && !draftLocked}
              maxLength={SHARE_CAPTION_LIMIT}
              multiline
              scrollEnabled
              textAlignVertical="top"
              placeholder="Add a note about this moment…"
              placeholderTextColor={theme.ink.muted}
              style={styles.caption}
            />
          </View>

          {containsBodyStats ? (
            <View style={styles.bodyStatsRow}>
              <View style={styles.visibilityCopy}>
                <Text style={styles.visibilityTitle}>Include body stats</Text>
                <Text style={styles.visibilitySummary}>Weight, BMI, and body measurements stay private unless you turn this on.</Text>
              </View>
              <View testID="include-body-stats-target" style={styles.switchTarget}>
                <Switch
                  testID="include-body-stats-switch"
                  accessibilityRole="switch"
                  accessibilityLabel="Include body stats"
                  accessibilityHint="Adds up to three body and workout metrics to this share"
                  accessibilityState={{ checked: includeBodyStats, disabled: continuing || draftLocked }}
                  value={includeBodyStats}
                  onValueChange={setIncludeBodyStats}
                  disabled={continuing || draftLocked}
                  hitSlop={{ top: 9, right: 6, bottom: 9, left: 6 }}
                  trackColor={{ false: theme.border.strong, true: theme.ink.action }}
                />
              </View>
            </View>
          ) : null}

          <PostVisibilitySwitch
            showPublicly={showPublicly}
            onChange={setShowPublicly}
            disabled={continuing || draftLocked}
          />

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

          <Pressable
            testID="share-studio-primary-action"
            accessibilityRole="button"
            accessibilityLabel={visibilityCopy.postAction}
            accessibilityHint="Returns this share draft for review or publishing"
            accessibilityState={{ disabled: picking || continuing || !mediaReady, busy: continuing }}
            disabled={picking || continuing || !mediaReady}
            onPress={() => void proceed()}
            style={({ pressed }) => [styles.continueButton, (picking || continuing || !mediaReady) && styles.disabled, pressed && styles.pressed]}
          >
            {continuing ? <ActivityIndicator color={theme.ink.inverse} /> : null}
            <Text style={styles.continueText}>{visibilityCopy.postAction}</Text>
            {!continuing ? <Ionicons name="arrow-forward" size={20} color={theme.ink.inverse} /> : null}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function selectedShareMedia(
  choice: MediaChoice,
  photo: CapturedProgressPhoto | null,
): ShareStudioResult['media'] {
  return photo && choice !== 'card'
    ? {
      kind: 'photo',
      source: choice,
      uri: photo.uri,
      width: photo.width,
      height: photo.height,
      capturedAt: photo.capturedAt,
      release: photo.release,
    }
    : { kind: 'card' };
}

function permissionMessage(cause: unknown): string {
  if (cause instanceof Error && cause.name === 'PhotoPermissionDeniedError') {
    return cause.message.toLowerCase().includes('library')
      ? 'Photo library access is off. Enable it in Settings to choose a photo.'
      : 'Camera access is off. Enable it in Settings to take a selfie.';
  }
  return messageOf(cause);
}

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'That could not be completed. Try again.';
}

async function safeRelease(photo: CapturedProgressPhoto | null): Promise<void> {
  if (!photo) return;
  try {
    await photo.release();
  } catch {
    // Cleanup is best effort; a locked temp file must not leak its replacement.
  }
}
