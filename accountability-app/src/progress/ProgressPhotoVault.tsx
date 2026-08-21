import { useEffect, useMemo, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppTheme } from '../ui/AppThemeProvider';
import { subscribePrivateMediaCacheInvalidation } from '../media/privateMediaInvalidation';
import { font, spacing, type AppThemeColors } from '../ui/theme';
import { saveProgressPhoto } from './api';
import { localDateKey, recordedAtForLocalDate } from './checkInDate';
import { chooseProgressPhoto, resolvePrivateProgressPhoto, type CapturedProgressPhoto, type ProgressPhotoSource, type ResolvedProgressPhoto } from './photoCapture';
import type { ProgressPhoto, SaveProgressPhotoInput } from './types';

type Props = Readonly<{
  photos: readonly ProgressPhoto[];
  expectedOwnerId: string;
  onSaved?: (photo: ProgressPhoto) => void;
  choosePhoto?: (source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>;
  savePhoto?: (input: SaveProgressPhotoInput, expectedOwnerId: string, operationId: string) => Promise<ProgressPhoto>;
  resolvePhoto?: (storagePath: string, expectedOwnerId: string) => Promise<ResolvedProgressPhoto>;
  createOperationId?: () => string;
  now?: () => Date;
}>;

type Draft = Readonly<{ ownerId: string; ownerToken: symbol; photo: CapturedProgressPhoto; dateKey: string; weight: string; operationId: string }>;
type ImageResult = Readonly<{ status: 'ready'; uri: string } | { status: 'error' }>;
type ImageState = Readonly<{ ownerId: string; ownerToken: symbol; key: string; results: Readonly<Record<string, ImageResult>> }>;
type BusyState = Readonly<{ ownerId: string; ownerToken: symbol }>;
type FrozenSubmission = Readonly<{ ownerToken: symbol; input: SaveProgressPhotoInput; operationId: string }>;

const PICK_ERROR = 'That photo couldn’t be opened. Try another.';
const SAVE_ERROR = 'Your private photo couldn’t save. Try again.';

export function ProgressPhotoVault({ photos, expectedOwnerId, onSaved, choosePhoto = chooseProgressPhoto, savePhoto = saveProgressPhoto, resolvePhoto = resolvePrivateProgressPhoto, createOperationId = Crypto.randomUUID, now = () => new Date() }: Props) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mountedRef = useRef(true);
  const ownerToken = useMemo(() => Symbol(expectedOwnerId), [expectedOwnerId]);
  const activeOwnerTokenRef = useRef<symbol | null>(null);
  const pickingRef = useRef<symbol | null>(null);
  const savingRef = useRef<symbol | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const submissionRef = useRef<FrozenSubmission | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pickingState, setPickingState] = useState<BusyState | null>(null);
  const [savingState, setSavingState] = useState<BusyState | null>(null);
  const [errorState, setErrorState] = useState<{ ownerId: string; ownerToken: symbol; message: string } | null>(null);
  const [imageState, setImageState] = useState<ImageState | null>(null);
  const [imageRetry, setImageRetry] = useState(0);
  const [submittedToken, setSubmittedToken] = useState<symbol | null>(null);

  useEffect(() => {
    activeOwnerTokenRef.current = ownerToken;
    return () => {
      const ownedDraft = draftRef.current;
      if (ownedDraft?.ownerToken === ownerToken) {
        draftRef.current = null;
        void ownedDraft.photo.release();
      }
      if (submissionRef.current?.ownerToken === ownerToken) submissionRef.current = null;
      if (activeOwnerTokenRef.current === ownerToken) activeOwnerTokenRef.current = null;
    };
  }, [ownerToken]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const preview = useMemo(() => selectProgressPreview(photos), [photos]);
  const previewKey = preview.map(({ photo }) => photo.id).join('|');
  const activeDraft = draft?.ownerId === expectedOwnerId && draft.ownerToken === ownerToken ? draft : null;
  const submitted = submittedToken === ownerToken;
  const picking = pickingState?.ownerId === expectedOwnerId && pickingState.ownerToken === ownerToken;
  const saving = savingState?.ownerId === expectedOwnerId && savingState.ownerToken === ownerToken;
  const error = errorState?.ownerId === expectedOwnerId && errorState.ownerToken === ownerToken ? errorState.message : null;
  const activeImages = imageState?.ownerId === expectedOwnerId && imageState.ownerToken === ownerToken && imageState.key === previewKey ? imageState : null;

  useEffect(() => {
    if (preview.length === 0) return;
    const capturedOwner = expectedOwnerId;
    const capturedToken = ownerToken;
    let alive = true;
    for (const { photo } of preview) {
      void resolvePhoto(photo.storagePath, capturedOwner)
        .then(({ localUri }) => {
          if (!alive || !isCurrent(capturedToken, activeOwnerTokenRef, mountedRef)) return;
          setImageState((current) => mergeImageResult(current, capturedOwner, capturedToken, previewKey, photo.id, { status: 'ready', uri: localUri }));
        })
        .catch(() => {
          if (!alive || !isCurrent(capturedToken, activeOwnerTokenRef, mountedRef)) return;
          setImageState((current) => mergeImageResult(current, capturedOwner, capturedToken, previewKey, photo.id, { status: 'error' }));
        });
    }
    return () => { alive = false; };
  }, [expectedOwnerId, imageRetry, ownerToken, preview, previewKey, resolvePhoto]);

  useEffect(() => subscribePrivateMediaCacheInvalidation(() => {
    setImageState(null);
    setImageRetry((value) => value + 1);
  }), []);

  const pick = async (source: ProgressPhotoSource) => {
    if (pickingRef.current === ownerToken || savingRef.current === ownerToken) return;
    const capturedOwner = expectedOwnerId;
    const capturedToken = ownerToken;
    pickingRef.current = capturedToken;
    setPickingState({ ownerId: capturedOwner, ownerToken: capturedToken });
    setErrorState(null);
    let selected: CapturedProgressPhoto | null = null;
    try {
      selected = await choosePhoto(source);
      if (!selected) return;
      if (!isCurrent(capturedToken, activeOwnerTokenRef, mountedRef)) {
        await selected.release();
        return;
      }
      const selectedDate = new Date(selected.capturedAt);
      if (!Number.isFinite(selectedDate.getTime())) throw new Error('Invalid photo date.');
      const nextDraft = { ownerId: capturedOwner, ownerToken: capturedToken, photo: selected, dateKey: localDateKey(selectedDate), weight: '', operationId: createOperationId() };
      draftRef.current = nextDraft;
      submissionRef.current = null;
      setSubmittedToken(null);
      setDraft(nextDraft);
    } catch (pickError) {
      if (selected && draftRef.current?.photo !== selected) await selected.release();
      if (!isCurrent(capturedToken, activeOwnerTokenRef, mountedRef)) return;
      setErrorState({ ownerId: capturedOwner, ownerToken: capturedToken, message: permissionMessage(pickError) ?? PICK_ERROR });
    } finally {
      if (pickingRef.current === capturedToken) pickingRef.current = null;
      if (isCurrent(capturedToken, activeOwnerTokenRef, mountedRef)) setPickingState(null);
    }
  };

  const closeDraft = () => {
    if (savingRef.current === ownerToken) return;
    const closing = draftRef.current;
    if (closing?.ownerToken === ownerToken) {
      draftRef.current = null;
      void closing.photo.release();
    }
    submissionRef.current = null;
    setSubmittedToken(null);
    setDraft(null);
    setErrorState(null);
  };

  const save = async () => {
    if (!activeDraft || savingRef.current === ownerToken) return;
    const capturedOwner = expectedOwnerId;
    const capturedToken = ownerToken;
    let submission = submissionRef.current?.ownerToken === capturedToken ? submissionRef.current : null;
    if (!submission) {
      let capturedAt: string;
      let weightKg: number | null;
      try {
        capturedAt = recordedAtForLocalDate(activeDraft.dateKey, now());
      } catch (dateError) {
        setErrorState({ ownerId: capturedOwner, ownerToken: capturedToken, message: dateError instanceof Error && dateError.message.includes('future') ? 'Photo date cannot be in the future.' : 'Enter a valid photo date.' });
        return;
      }
      try {
        weightKg = optionalWeight(activeDraft.weight);
      } catch {
        setErrorState({ ownerId: capturedOwner, ownerToken: capturedToken, message: 'Weight must be between 20 and 500 kg with up to two decimals.' });
        return;
      }
      submission = { ownerToken: capturedToken, input: { localUri: activeDraft.photo.uri, capturedAt, weightKg }, operationId: activeDraft.operationId };
      submissionRef.current = submission;
      setSubmittedToken(capturedToken);
    }
    savingRef.current = capturedToken;
    setSavingState({ ownerId: capturedOwner, ownerToken: capturedToken });
    setErrorState(null);
    try {
      const saved = await savePhoto(submission.input, capturedOwner, submission.operationId);
      if (!isCurrent(capturedToken, activeOwnerTokenRef, mountedRef)) return;
      draftRef.current = null;
      submissionRef.current = null;
      setSubmittedToken(null);
      setDraft(null);
      await activeDraft.photo.release();
      onSaved?.(saved);
    } catch {
      if (isCurrent(capturedToken, activeOwnerTokenRef, mountedRef)) setErrorState({ ownerId: capturedOwner, ownerToken: capturedToken, message: SAVE_ERROR });
    } finally {
      if (savingRef.current === capturedToken) savingRef.current = null;
      if (isCurrent(capturedToken, activeOwnerTokenRef, mountedRef)) setSavingState(null);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Appearance progress</Text>
          <Text style={styles.private}>Private · Only you can see this</Text>
        </View>
        <View accessibilityLabel="Private progress photos" style={styles.lockBadge}><Text style={styles.lockText}>PRIVATE</Text></View>
      </View>
      <Text style={styles.intro}>Add dated photos to compare changes over time. Nothing is posted when you take or choose a photo.</Text>

      {preview.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>＋</Text></View>
          <View style={styles.emptyCopyWrap}>
            <Text style={styles.emptyTitle}>No private progress photos yet</Text>
            <Text style={styles.emptyCopy}>Your first saved photo becomes Before. Your newest becomes Latest.</Text>
          </View>
        </View>
      ) : (
        <View style={styles.comparison}>
          {preview.map(({ label, photo }) => {
            const result = activeImages?.results[photo.id];
            return <PrivatePhotoCard
              key={`${label}-${photo.id}`}
              label={label}
              photo={photo}
              localUri={result?.status === 'ready' ? result.uri : null}
              loading={!result}
              failed={result?.status === 'error'}
              onRetry={() => setImageRetry((value) => value + 1)}
              styles={styles}
            />;
          })}
        </View>
      )}

      {error && !activeDraft ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View testID="progress-photo-source-actions" style={styles.sourceActions}>
        <SourceButton label={Platform.OS === 'web' ? 'Choose selfie' : 'Take selfie'} detail={Platform.OS === 'web' ? 'Photo library on web' : 'Front camera'} onPress={() => void pick('front-camera')} disabled={picking || saving} styles={styles} />
        <SourceButton label={Platform.OS === 'web' ? 'Choose photo' : 'Take photo'} detail={Platform.OS === 'web' ? 'Photo library on web' : 'Rear camera'} onPress={() => void pick('rear-camera')} disabled={picking || saving} styles={styles} />
        <SourceButton label="Choose from gallery" detail="Existing photo" onPress={() => void pick('gallery')} disabled={picking || saving} styles={styles} />
      </View>
      {picking ? (
        <View accessibilityRole="progressbar" accessibilityLabel="Opening private photo picker" style={styles.pickingRow}>
          <ActivityIndicator color={theme.ink.action} /><Text style={styles.pickingText}>Opening photos…</Text>
        </View>
      ) : null}

      <Modal visible={!!activeDraft} transparent animationType="slide" onRequestClose={closeDraft}>
        <KeyboardAvoidingView style={styles.modalSafe} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.scrim}>
            <View accessibilityViewIsModal style={styles.sheet}>
              <ScrollView testID="progress-photo-modal-scroll" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetScroll}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>Review private photo</Text>
            <Text style={styles.sheetCopy}>Not saved yet. Confirm the date, then save it only to your private progress.</Text>
            {activeDraft ? <Image source={{ uri: activeDraft.photo.uri }} accessibilityLabel="Selected private progress photo preview" resizeMode="cover" style={styles.previewImage} /> : null}
            <Text style={styles.fieldLabel}>Photo date</Text>
            <TextInput
              accessibilityLabel="Progress photo date"
              value={activeDraft?.dateKey ?? ''}
              onChangeText={(value) => {
                if (submissionRef.current?.ownerToken === ownerToken) return;
                setDraft((current) => {
                  const next = current?.ownerToken === ownerToken ? { ...current, dateKey: value } : current;
                  draftRef.current = next;
                  return next;
                });
                setErrorState(null);
              }}
              editable={!saving && !submitted}
              maxLength={10}
              keyboardType="numbers-and-punctuation"
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.ink.muted}
              style={[styles.dateInput, error && styles.invalid]}
            />
            <Text style={styles.dateHint}>Use YYYY-MM-DD. You can correct the original photo date.</Text>
            <Text style={styles.fieldLabel}>Weight on this date (optional)</Text>
            <TextInput
              accessibilityLabel="Progress photo weight in kilograms"
              value={activeDraft?.weight ?? ''}
              onChangeText={(value) => {
                if (submissionRef.current?.ownerToken === ownerToken) return;
                setDraft((current) => {
                  const next = current?.ownerToken === ownerToken ? { ...current, weight: value } : current;
                  draftRef.current = next;
                  return next;
                });
                setErrorState(null);
              }}
              editable={!saving && !submitted}
              maxLength={7}
              keyboardType="decimal-pad"
              placeholder="kg"
              placeholderTextColor={theme.ink.muted}
              style={[styles.dateInput, error && styles.invalid]}
            />
            {error && activeDraft ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {submitted && !saving ? <Text style={styles.dateHint}>Details are locked for this retry. Cancel and choose the photo again to edit.</Text> : null}
            <View style={styles.sheetActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel private photo" accessibilityState={{ disabled: saving }} disabled={saving} onPress={closeDraft} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Save private progress photo" accessibilityState={{ disabled: saving, busy: saving }} disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                {saving ? <ActivityIndicator color={theme.ink.inverse} /> : <Text style={styles.primaryButtonText}>Save privately</Text>}
              </Pressable>
            </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

export function selectProgressPreview(photos: readonly ProgressPhoto[]) {
  if (photos.length === 0) return [];
  let earliest = photos[0];
  let latest = photos[0];
  let earliestTime = new Date(earliest.capturedAt).getTime();
  let latestTime = earliestTime;
  for (let index = 1; index < photos.length; index += 1) {
    const candidate = photos[index];
    const candidateTime = new Date(candidate.capturedAt).getTime();
    if (candidateTime < earliestTime || (candidateTime === earliestTime && candidate.id.localeCompare(earliest.id) < 0)) { earliest = candidate; earliestTime = candidateTime; }
    if (candidateTime > latestTime || (candidateTime === latestTime && candidate.id.localeCompare(latest.id) > 0)) { latest = candidate; latestTime = candidateTime; }
  }
  return earliest.id === latest.id
    ? [{ label: 'Before' as const, photo: earliest }]
    : [{ label: 'Before' as const, photo: earliest }, { label: 'Latest' as const, photo: latest }];
}

function mergeImageResult(
  current: ImageState | null,
  ownerId: string,
  ownerToken: symbol,
  key: string,
  photoId: string,
  result: ImageResult,
): ImageState {
  const results = current?.ownerId === ownerId && current.ownerToken === ownerToken && current.key === key
    ? current.results
    : {};
  return { ownerId, ownerToken, key, results: { ...results, [photoId]: result } };
}

function PrivatePhotoCard({ label, photo, localUri, loading, failed, onRetry, styles }: { label: 'Before' | 'Latest'; photo: ProgressPhoto; localUri: string | null; loading: boolean; failed: boolean; onRetry: () => void; styles: ReturnType<typeof createStyles> }) {
  const date = new Date(photo.capturedAt).toLocaleDateString();
  return (
    <View accessibilityLabel={`Private ${label} progress photo from ${date}`} style={styles.photoCard}>
      {localUri ? (
        <Image source={{ uri: localUri }} accessibilityLabel={`Private ${label} progress photo`} resizeMode="cover" style={styles.savedPhoto} />
      ) : (
        <View style={styles.photoPlaceholder}>
          {loading ? <><ActivityIndicator /><Text style={styles.photoPlaceholderText}>Loading private photo…</Text></> : null}
          {failed ? <><Text style={styles.photoPlaceholderText}>Private photo couldn’t load.</Text><Pressable accessibilityRole="button" accessibilityLabel={`Retry ${label} private photo`} onPress={onRetry} style={styles.photoRetry}><Text style={styles.photoRetryText}>Retry</Text></Pressable></> : null}
        </View>
      )}
      <Text style={styles.photoLabel}>{label}</Text><Text style={styles.photoDate}>{date}</Text>
      {photo.weightKg == null ? null : <Text style={styles.photoWeight}>{photo.weightKg.toFixed(1)} kg</Text>}
    </View>
  );
}

function SourceButton({ label, detail, onPress, disabled, styles }: { label: string; detail: string; onPress: () => void; disabled: boolean; styles: ReturnType<typeof createStyles> }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={detail} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.sourceButton, pressed && styles.pressed]}>
      <Text style={styles.sourceLabel}>{label}</Text><Text style={styles.sourceDetail}>{detail}</Text>
    </Pressable>
  );
}

function permissionMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('permissionKind' in error)) return null;
  return error.permissionKind === 'camera'
    ? 'Camera access is off. Enable it in Settings to take a progress photo.'
    : error.permissionKind === 'gallery'
      ? 'Photo library access is off. Enable it in Settings to choose a progress photo.'
      : null;
}

function isCurrent(token: symbol, activeOwnerTokenRef: React.MutableRefObject<symbol | null>, mountedRef: React.MutableRefObject<boolean>) {
  return mountedRef.current && activeOwnerTokenRef.current === token;
}

function optionalWeight(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(trimmed)) throw new Error('Invalid weight.');
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 20 || parsed > 500) throw new Error('Invalid weight.');
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  section: { marginTop: spacing.section },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headingCopy: { flexGrow: 1, flexShrink: 1, minWidth: 180 },
  title: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 20 },
  private: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18, marginTop: spacing.xs },
  lockBadge: { borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.muted, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  lockText: { color: theme.ink.secondary, fontFamily: font.bold, fontSize: 9, letterSpacing: 1.1 },
  intro: { color: theme.ink.secondary, fontFamily: font.regular, fontSize: 13.5, lineHeight: 20, marginTop: spacing.md },
  empty: { marginTop: spacing.md, minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card, borderRadius: 16, padding: spacing.lg },
  emptyMark: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface.muted },
  emptyMarkText: { color: theme.ink.action, fontFamily: font.regular, fontSize: 26 },
  emptyCopyWrap: { flex: 1, minWidth: 0 },
  emptyTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 15, lineHeight: 20 },
  emptyCopy: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  comparison: { marginTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCard: { flexGrow: 1, flexBasis: 144, minWidth: 132, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card, borderRadius: 16, padding: spacing.sm },
  photoPlaceholder: { aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: theme.surface.muted, alignItems: 'center', justifyContent: 'center' },
  savedPhoto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: theme.surface.muted },
  photoPlaceholderText: { color: theme.ink.muted, fontFamily: font.bold, fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: spacing.xs },
  photoRetry: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md },
  photoRetryText: { color: theme.ink.action, fontFamily: font.bold, fontSize: 12 },
  photoLabel: { color: theme.ink.action, fontFamily: font.bold, fontSize: 11, letterSpacing: 0.8, marginTop: spacing.sm },
  photoDate: { color: theme.ink.primary, fontFamily: font.semibold, fontSize: 14, lineHeight: 20, marginTop: spacing.xs },
  photoWeight: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18, marginTop: spacing.xs },
  sourceActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  sourceButton: { minHeight: 56, flexGrow: 1, flexBasis: 138, justifyContent: 'center', borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  sourceLabel: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 13.5, lineHeight: 18 },
  sourceDetail: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 11.5, lineHeight: 17, marginTop: 2 },
  pickingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  pickingText: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 13 },
  error: { color: theme.status.danger, fontFamily: font.medium, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  modalSafe: { flex: 1 },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: theme.interaction.scrim },
  sheet: { width: '100%', maxWidth: 640, maxHeight: '94%', alignSelf: 'center', backgroundColor: theme.surface.canvas, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  sheetScroll: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xxl },
  sheetTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 21, lineHeight: 27 },
  sheetCopy: { color: theme.ink.secondary, fontFamily: font.regular, fontSize: 13.5, lineHeight: 20, marginTop: spacing.xs },
  previewImage: { width: '100%', maxHeight: 280, aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: theme.surface.muted, marginTop: spacing.md },
  fieldLabel: { color: theme.ink.secondary, fontFamily: font.semibold, fontSize: 13, marginTop: spacing.md, marginBottom: spacing.xs },
  dateInput: { minHeight: 48, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card, borderRadius: 12, paddingHorizontal: spacing.md, color: theme.ink.primary, fontFamily: font.medium, fontSize: 16 },
  invalid: { borderColor: theme.border.danger },
  dateHint: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 12, lineHeight: 17, marginTop: spacing.xs },
  sheetActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg },
  secondaryButton: { minHeight: 48, minWidth: 112, flexGrow: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border.subtle, borderRadius: 12, paddingHorizontal: spacing.lg },
  secondaryButtonText: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 14 },
  primaryButton: { minHeight: 48, minWidth: 152, flexGrow: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: theme.ink.action, paddingHorizontal: spacing.lg },
  primaryButtonText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 14 },
  pressed: { opacity: 0.7 },
});
