import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useAppTheme } from '../ui/AppThemeProvider';
import { createShareStudioStyles } from './ShareStudio.styles';
import {
  createShareStudioResult,
  SHARE_CAPTION_LIMIT,
  type ShareStudioContext,
  type ShareStudioResult,
} from './shareStudioDraft';

export { SHARE_CAPTION_LIMIT, type ShareStudioContext, type ShareStudioResult } from './shareStudioDraft';

type MediaChoice = 'card' | 'selfie' | 'gallery';
type Props = Readonly<{
  visible: boolean;
  expectedOwnerId: string;
  context: ShareStudioContext;
  defaultCaption?: string;
  onContinue: (result: ShareStudioResult) => void | Promise<void>;
  onCancel: () => void;
  choosePhoto?: (source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>;
  continueLabel?: string;
}>;

const mediaOptions: readonly Readonly<{
  id: MediaChoice;
  label: string;
  detail: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}>[] = [
  { id: 'card', label: 'Card only', detail: 'Share your result without a new photo.', icon: 'stats-chart-outline' },
  { id: 'selfie', label: 'Take selfie', detail: 'Use the front camera for this share.', icon: 'camera-outline' },
  { id: 'gallery', label: 'Choose photo', detail: 'Pick one photo for this share.', icon: 'image-outline' },
];

export function ShareStudio(props: Props) {
  return <ShareStudioSession key={`${props.expectedOwnerId}:${props.visible ? 'open' : 'closed'}`} {...props} />;
}

function ShareStudioSession({
  visible,
  expectedOwnerId,
  context,
  defaultCaption = '',
  onContinue,
  onCancel,
  choosePhoto = chooseProgressPhoto,
  continueLabel = 'Continue',
}: Props) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createShareStudioStyles(theme), [theme]);
  const [choice, setChoice] = useState<MediaChoice>('card');
  const [photo, setPhoto] = useState<CapturedProgressPhoto | null>(null);
  const [caption, setCaption] = useState(defaultCaption.slice(0, SHARE_CAPTION_LIMIT));
  const [showOnBuddyCard, setShowOnBuddyCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const mounted = useRef(true);
  const ownerLease = useRef(Symbol(expectedOwnerId));
  const photoRef = useRef<CapturedProgressPhoto | null>(null);
  const pickerFlight = useRef(false);
  const continueFlight = useRef(false);

  const releaseOwnedPhoto = useCallback(async () => {
    const owned = photoRef.current;
    photoRef.current = null;
    setPhoto(null);
    if (owned) await owned.release();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const owned = photoRef.current;
      photoRef.current = null;
      void owned?.release();
    };
  }, []);

  const selectMedia = useCallback(async (next: MediaChoice) => {
    if (picking || continuing || pickerFlight.current) return;
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
        await selected.release();
        return;
      }
      await releaseOwnedPhoto();
      if (!mounted.current || lease !== ownerLease.current) {
        await selected.release();
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
  }, [choosePhoto, continuing, picking, releaseOwnedPhoto]);

  const cancel = useCallback(() => {
    if (continuing || continueFlight.current) return;
    ownerLease.current = Symbol(expectedOwnerId);
    pickerFlight.current = false;
    setPicking(false);
    void releaseOwnedPhoto();
    onCancel();
  }, [continuing, expectedOwnerId, onCancel, releaseOwnedPhoto]);

  const proceed = useCallback(async () => {
    if (picking || continuing || continueFlight.current) return;
    const lease = ownerLease.current;
    try {
      const media = photo && choice !== 'card'
        ? {
          kind: 'photo' as const,
          source: choice,
          uri: photo.uri,
          width: photo.width,
          height: photo.height,
          capturedAt: photo.capturedAt,
          release: photo.release,
        }
        : { kind: 'card' as const };
      const result = createShareStudioResult({
        ownerId: expectedOwnerId,
        context,
        caption,
        showOnBuddyCard,
        media,
      });
      continueFlight.current = true;
      setContinuing(true);
      // Continue transfers ownership of a selected temporary file to the parent.
      if (media.kind === 'photo') {
        photoRef.current = null;
        setPhoto(null);
        setChoice('card');
      }
      await onContinue(result);
    } catch (cause) {
      if (mounted.current && lease === ownerLease.current) setError(messageOf(cause));
    } finally {
      if (mounted.current && lease === ownerLease.current) {
        continueFlight.current = false;
        setContinuing(false);
      }
    }
  }, [caption, choice, context, continuing, expectedOwnerId, onContinue, photo, picking, showOnBuddyCard]);

  const summary = showOnBuddyCard
    ? 'Public · also shown on your Buddy Card'
    : 'Buddies only';

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
          <View testID="share-card-preview" style={styles.preview} accessibilityLabel={`Share preview: ${context.title}, ${context.date}`}>
            {photo && choice !== 'card' ? (
              <Image source={{ uri: photo.uri }} style={styles.previewPhoto} resizeMode="cover" accessibilityIgnoresInvertColors />
            ) : null}
            <View style={[styles.previewShade, photo && choice !== 'card' ? styles.previewShadePhoto : null]}>
              <Text style={styles.previewEyebrow}>{context.date}</Text>
              <Text style={styles.previewTitle}>{context.title}</Text>
              <View style={styles.metricRow}>
                {context.metrics.map((metric) => (
                  <View key={`${metric.label}:${metric.value}`} style={styles.metric}>
                    <Text style={styles.metricValue}>{metric.value}</Text>
                    <Text style={styles.metricLabel}>{metric.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add to your card</Text>
            <Text style={styles.sectionCopy}>Choose how this share looks. A selected photo is used only for this share.</Text>
            <View accessibilityRole="radiogroup" style={styles.mediaOptions}>
              {mediaOptions.map((option) => {
                const selected = choice === option.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityHint={option.detail}
                    accessibilityState={{ selected, disabled: picking || continuing }}
                    disabled={picking || continuing}
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
              maxLength={SHARE_CAPTION_LIMIT}
              multiline
              scrollEnabled
              textAlignVertical="top"
              placeholder="Add a note about this moment…"
              placeholderTextColor={theme.ink.muted}
              style={styles.caption}
            />
          </View>

          <View style={styles.visibility}>
            <View style={styles.visibilityCopy}>
              <Text style={styles.visibilityTitle}>Show on Buddy Card too</Text>
              <Text accessibilityLiveRegion="polite" style={styles.visibilitySummary}>{summary}</Text>
            </View>
            <Switch
              accessibilityLabel="Show on Buddy Card too"
              accessibilityHint="When on, everyone can see this post and it also appears on your Buddy Card"
              value={showOnBuddyCard}
              onValueChange={setShowOnBuddyCard}
              disabled={continuing}
              trackColor={{ false: theme.border.strong, true: theme.ink.action }}
            />
          </View>

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue sharing"
            accessibilityHint="Returns this share draft for review or publishing"
            accessibilityState={{ disabled: picking || continuing, busy: continuing }}
            disabled={picking || continuing}
            onPress={() => void proceed()}
            style={({ pressed }) => [styles.continueButton, (picking || continuing) && styles.disabled, pressed && styles.pressed]}
          >
            {continuing ? <ActivityIndicator color={theme.ink.inverse} /> : null}
            <Text style={styles.continueText}>{continueLabel}</Text>
            {!continuing ? <Ionicons name="arrow-forward" size={20} color={theme.ink.inverse} /> : null}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
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
