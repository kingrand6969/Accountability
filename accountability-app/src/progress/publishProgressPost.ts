import { decode } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';

import { createPost, findMatchingStandardPostIdForOperation, findMyPostByOperationId } from '../feed/api';
import { markFeedPostPublished } from '../feed/feedPublishSignal';
import { deletePostImageForOperation, uploadPostImageWithDigest } from '../feed/uploadPostImage';
import type { Insights } from '../insights/api';
import { supabase } from '../lib/supabase';
import { canonicalShareStudioContext, type ShareStudioResult } from '../share/shareStudioDraft';
import { listMeasurements, listProgressPhotos } from './api';
import { calculateBmi } from './bmi';
import { resolvePrivateProgressPhoto } from './photoCapture';
import { selectProgressPreview } from './ProgressPhotoVault';
import {
  createProgressShareRenderModel,
  PROGRESS_SHARE_HEIGHT,
  PROGRESS_SHARE_WIDTH,
  type ProgressSharePeriod,
  type ProgressShareRenderModel,
  type ProgressShareSnapshot,
} from './ProgressShareCard';
import type { BodyMeasurement, ProgressPhoto } from './types';
import { postVisibility } from './visibility';
import {
  clearProgressShareRecovery,
  assertProgressShareRecoveryCapacity,
  listProgressShareRecovery,
  recordProgressShareRecovery,
  updateProgressShareRecoveryStatus,
  type ListedProgressShareRecovery,
  type ProgressShareRecoveryEntry,
} from './progressShareRecovery';

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
export const PROGRESS_SHARE_MAX_JPEG_BYTES = 4 * 1024 * 1024;

export type ProgressFeedShareData = Readonly<{
  kind: 'journey_progress';
  period: ProgressSharePeriod;
  workouts: number;
  active_days: number;
  tasks_done: number;
  client_media_sha256: string;
  weight_kg?: number;
  bmi?: number;
}>;

export type ProgressSnapshotInput = Readonly<{
  ownerId: string;
  period: ProgressSharePeriod;
  openedAt: Date;
  workouts: number;
  activeDays: number;
  tasksDone: number;
  weightKg: number | null;
  bmi: number | null;
  bodyMeasurement: Readonly<{ id: string; recordedAt: string; weightKg: number; heightCm: number }> | null;
  photos: readonly ProgressPhoto[];
}>;

type PrepareDependencies = Readonly<{
  assertOwner: (expectedOwnerId: string) => Promise<void>;
  resolvePrivatePhoto: typeof resolvePrivateProgressPhoto;
}>;

const defaultPrepareDependencies: PrepareDependencies = {
  assertOwner: assertCurrentOwner,
  resolvePrivatePhoto: resolvePrivateProgressPhoto,
};

/** Resolves a private, owner-bound Before/Latest pair only for the active review session. */
export async function prepareProgressShareSnapshot(
  input: ProgressSnapshotInput,
  dependencies: PrepareDependencies = defaultPrepareDependencies,
): Promise<ProgressShareSnapshot> {
  await dependencies.assertOwner(input.ownerId);
  assertSnapshotBodySource(input);
  const selected = selectProgressPreview(input.photos).map(({ photo }) => photo);
  const privatePhotos = [];
  for (const photo of selected) {
    const { localUri } = await dependencies.resolvePrivatePhoto(photo.storagePath, input.ownerId);
    await dependencies.assertOwner(input.ownerId);
    privatePhotos.push(Object.freeze({
      id: photo.id,
      storagePath: photo.storagePath,
      capturedAt: photo.capturedAt,
      localUri,
    }));
  }
  await dependencies.assertOwner(input.ownerId);
  const date = input.openedAt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const periodWord = input.period === 'week' ? 'weekly' : 'monthly';
  const metrics = [
    { label: 'Workouts', value: String(safeCount(input.workouts)), sensitivity: 'standard' as const },
    { label: 'Active days', value: String(safeCount(input.activeDays)), sensitivity: 'standard' as const },
    { label: 'Tasks done', value: String(safeCount(input.tasksDone)), sensitivity: 'standard' as const },
    ...(input.weightKg === null ? [] : [{ label: 'Current weight', value: `${input.weightKg.toFixed(1)} kg`, sensitivity: 'body' as const }]),
    ...(input.bmi === null ? [] : [{ label: 'BMI', value: input.bmi.toFixed(1), sensitivity: 'body' as const }]),
  ];
  return Object.freeze({
    ownerId: input.ownerId,
    period: input.period,
    openedAt: input.openedAt.toISOString(),
    workouts: safeCount(input.workouts),
    activeDays: safeCount(input.activeDays),
    tasksDone: safeCount(input.tasksDone),
    weightKg: input.weightKg,
    bmi: input.bmi,
    bodyMeasurement: input.bodyMeasurement ? Object.freeze({ ...input.bodyMeasurement }) : null,
    context: Object.freeze({
      title: `My ${periodWord} progress`,
      date,
      metrics: Object.freeze(metrics.map((metric) => Object.freeze(metric))),
    }),
    privatePhotos: Object.freeze(privatePhotos),
  });
}

export function progressSnapshotInput(
  ownerId: string,
  period: ProgressSharePeriod,
  openedAt: Date,
  insights: Pick<Insights, 'workouts' | 'daysActive' | 'tasksDone'>,
  latest: BodyMeasurement | undefined,
  photos: readonly ProgressPhoto[],
): ProgressSnapshotInput {
  return {
    ownerId,
    period,
    openedAt,
    workouts: insights.workouts,
    activeDays: insights.daysActive,
    tasksDone: insights.tasksDone,
    weightKg: latest?.weightKg ?? null,
    bmi: latest ? calculateBmi(latest.weightKg, latest.heightCm) : null,
    bodyMeasurement: latest ? {
      id: latest.id,
      recordedAt: latest.recordedAt,
      weightKg: latest.weightKg,
      heightCm: latest.heightCm,
    } : null,
    photos,
  };
}

export function buildProgressShareData(
  snapshot: ProgressShareSnapshot,
  draft: Pick<ShareStudioResult, 'includeBodyStats'>,
  mediaSha256: string,
): ProgressFeedShareData {
  if (!SHA256_HEX.test(mediaSha256)) throw new Error('The captured media digest is invalid.');
  return Object.freeze({
    kind: 'journey_progress' as const,
    period: snapshot.period,
    workouts: snapshot.workouts,
    active_days: snapshot.activeDays,
    tasks_done: snapshot.tasksDone,
    client_media_sha256: mediaSha256,
    ...(draft.includeBodyStats && snapshot.weightKg !== null ? { weight_kg: snapshot.weightKg } : {}),
    ...(draft.includeBodyStats && snapshot.bmi !== null ? { bmi: snapshot.bmi } : {}),
  });
}

export function progressShareSnapshotForDraft(
  snapshot: ProgressShareSnapshot,
  draft: Pick<ShareStudioResult, 'includeBodyStats' | 'media'>,
): ProgressShareSnapshot {
  return Object.freeze({
    ...snapshot,
    weightKg: draft.includeBodyStats ? snapshot.weightKg : null,
    bmi: draft.includeBodyStats ? snapshot.bmi : null,
    bodyMeasurement: draft.includeBodyStats ? snapshot.bodyMeasurement : null,
    privatePhotos: draft.media.kind === 'card' ? snapshot.privatePhotos : Object.freeze([]),
  });
}

export type ProgressPostDependencies = {
  assertOwner: (expectedOwnerId: string) => Promise<void>;
  revalidateSources: (snapshot: ProgressShareSnapshot, draft: ShareStudioResult) => Promise<void>;
  captureCard: (
    model: ProgressShareRenderModel,
    options: Readonly<{ width: number; height: number; format: 'jpg'; quality: number }>,
  ) => Promise<string>;
  uploadDerivedImage: typeof uploadPostImageWithDigest;
  digestCapturedImage: (bytes: Uint8Array) => Promise<string>;
  createPost: typeof createPost;
  markFeedPostPublished: typeof markFeedPostPublished;
  findExistingPost: (input: Readonly<{
    ownerId: string;
    operationId: string;
    body: string;
    mediaRef: string;
    showPublicly: boolean;
    shareData: ProgressFeedShareData;
  }>) => Promise<string | null>;
  deleteDerivedImage: typeof deletePostImageForOperation;
  findPostByOperationId: (operationId: string, ownerId: string) => Promise<string | null>;
  recordUploadedRecovery: (entry: ProgressShareRecoveryEntry) => Promise<void>;
  clearUploadedRecovery: (ownerId: string, operationId: string) => Promise<void>;
  updateUploadedRecoveryStatus: (
    ownerId: string,
    operationId: string,
    status: 'cleanup_pending',
  ) => Promise<void>;
  listUploadedRecovery: (ownerId: string) => Promise<ListedProgressShareRecovery[]>;
  assertUploadedRecoveryCapacity: (ownerId: string, operationId: string) => Promise<void>;
};

const defaultDependencies: ProgressPostDependencies = {
  assertOwner: assertCurrentOwner,
  revalidateSources: revalidateProgressShareSources,
  async captureCard() {
    throw new Error('The reviewed progress card is not ready.');
  },
  uploadDerivedImage: uploadPostImageWithDigest,
  async digestCapturedImage(bytes) {
    const owned = Uint8Array.from(bytes);
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, owned.buffer);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  },
  createPost,
  markFeedPostPublished,
  findExistingPost: (input) => findMatchingStandardPostIdForOperation({
    expectedOwnerId: input.ownerId,
    operationId: input.operationId,
    body: input.body,
    imageUrl: input.mediaRef,
    showPublicly: input.showPublicly,
    postType: 'milestone',
    shareData: input.shareData,
  }),
  deleteDerivedImage: deletePostImageForOperation,
  findPostByOperationId: async (operationId, ownerId) => {
    await assertCurrentOwner(ownerId);
    const postId = await findMyPostByOperationId(operationId);
    await assertCurrentOwner(ownerId);
    return postId;
  },
  recordUploadedRecovery: (entry) => recordProgressShareRecovery(entry),
  clearUploadedRecovery: (ownerId, operationId) => clearProgressShareRecovery(ownerId, operationId),
  updateUploadedRecoveryStatus: (ownerId, operationId, status) =>
    updateProgressShareRecoveryStatus(ownerId, operationId, status),
  listUploadedRecovery: (ownerId) => listProgressShareRecovery(ownerId),
  assertUploadedRecoveryCapacity: (ownerId, operationId) =>
    assertProgressShareRecoveryCapacity(ownerId, operationId),
};

const inFlightPublishes = new Map<string, Readonly<{ fingerprint: string; promise: Promise<string> }>>();
type ProgressPublishArtifactBase = Readonly<{
  ownerId: string;
  operationId: string;
  draftFingerprint: string;
  sha256: string;
  createdAt: number;
}>;
type CapturedProgressArtifact = ProgressPublishArtifactBase & Readonly<{
  stage: 'captured';
  base64: string;
  byteLength: number;
}>;
type UploadedProgressArtifact = ProgressPublishArtifactBase & Readonly<{
  stage: 'uploaded';
  mediaRef: string;
  cleanupPending?: boolean;
}>;
type ProgressPublishArtifact = CapturedProgressArtifact | UploadedProgressArtifact;
const ARTIFACT_LIMIT = 8;
const CAPTURE_ARTIFACT_LIMIT = 2;
const CAPTURE_ARTIFACT_TOTAL_BYTES = 8 * 1024 * 1024;
const ARTIFACT_MAX_AGE_MS = 30 * 60 * 1000;
const publishArtifacts = new Map<string, ProgressPublishArtifact>();

export function clearProgressPublishArtifacts(ownerId?: string, operationId?: string): void {
  for (const [key, artifact] of publishArtifacts) {
    const matches = (ownerId === undefined || artifact.ownerId === ownerId) &&
      (operationId === undefined || artifact.operationId === operationId);
    if (!matches) continue;
    // Uploaded recovery is durable; component/account teardown can clear every
    // live artifact, including sensitive captured bytes, without losing cleanup.
    publishArtifacts.delete(key);
  }
}

export function publishProgressPost(
  input: Readonly<{ snapshot: ProgressShareSnapshot; draft: ShareStudioResult }>,
  dependencyOverrides: Partial<ProgressPostDependencies> = {},
): Promise<string> {
  try {
    assertFrozenDraftIdentity(input.snapshot, input.draft);
  } catch (error) {
    return Promise.reject(error);
  }
  const usedSnapshot = progressShareSnapshotForDraft(input.snapshot, input.draft);
  const usedInput = { snapshot: usedSnapshot, draft: input.draft };
  const key = `${usedSnapshot.ownerId}:${input.draft.operationId}`;
  const existing = inFlightPublishes.get(key);
  const fingerprint = progressDraftFingerprint(usedSnapshot, input.draft);
  if (existing) {
    return existing.fingerprint === fingerprint
      ? existing.promise
      : Promise.reject(new Error('This progress share changed after review.'));
  }
  pruneProgressPublishArtifacts();
  const artifact = publishArtifacts.get(key);
  if (artifact && artifact.draftFingerprint !== fingerprint) {
    if (artifact.stage === 'captured') publishArtifacts.delete(key);
    return Promise.reject(new Error('This progress share changed after review.'));
  }
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const pending = publishOnce(usedInput, dependencies, fingerprint, artifact ?? null);
  inFlightPublishes.set(key, { fingerprint, promise: pending });
  void pending.finally(() => {
    if (inFlightPublishes.get(key)?.promise === pending) inFlightPublishes.delete(key);
  }).catch(() => {});
  return pending;
}

async function publishOnce(
  input: Readonly<{ snapshot: ProgressShareSnapshot; draft: ShareStudioResult }>,
  dependencies: ProgressPostDependencies,
  draftFingerprint: string,
  retainedArtifact: ProgressPublishArtifact | null,
): Promise<string> {
  const { snapshot, draft } = input;
  await dependencies.assertOwner(snapshot.ownerId);
  await dependencies.revalidateSources(snapshot, draft);
  await dependencies.assertOwner(snapshot.ownerId);
  let artifact = retainedArtifact;
  if (!artifact) {
    const renderModel = createProgressShareRenderModel(snapshot, draft);
    const base64 = await dependencies.captureCard(renderModel, {
      width: PROGRESS_SHARE_WIDTH,
      height: PROGRESS_SHARE_HEIGHT,
      format: 'jpg',
      quality: 0.95,
    });
    const jpeg = validateProgressShareJpeg(base64);
    const sha256 = await dependencies.digestCapturedImage(jpeg.bytes);
    if (!SHA256_HEX.test(sha256)) throw new Error('The captured media digest is invalid.');
    await dependencies.assertOwner(snapshot.ownerId);
    artifact = Object.freeze({
      stage: 'captured' as const,
      ownerId: snapshot.ownerId,
      operationId: draft.operationId,
      draftFingerprint,
      base64,
      byteLength: jpeg.bytes.byteLength,
      sha256,
      createdAt: Date.now(),
    });
    retainProgressPublishArtifact(artifact);
  }
  if (artifact.stage === 'captured') {
    await dependencies.revalidateSources(snapshot, draft);
    await dependencies.assertOwner(snapshot.ownerId);
    await dependencies.assertUploadedRecoveryCapacity(snapshot.ownerId, draft.operationId);
    await dependencies.assertOwner(snapshot.ownerId);
    const uploaded = await dependencies.uploadDerivedImage(artifact.base64, 'jpg', draft.operationId, snapshot.ownerId);
    if (uploaded.sha256 !== artifact.sha256) {
      throw new Error('The uploaded progress image did not match the reviewed capture.');
    }
    const uploadedAt = Date.now();
    await dependencies.recordUploadedRecovery(Object.freeze({
      ownerId: snapshot.ownerId,
      operationId: draft.operationId,
      mediaRef: uploaded.mediaRef,
      sha256: uploaded.sha256,
      artifactFingerprint: recoveryArtifactFingerprint(draft.operationId, uploaded.sha256),
      status: 'uploaded' as const,
      createdAt: uploadedAt,
      updatedAt: uploadedAt,
    }));
    artifact = Object.freeze({
      stage: 'uploaded' as const,
      ownerId: snapshot.ownerId,
      operationId: draft.operationId,
      draftFingerprint,
      mediaRef: uploaded.mediaRef,
      sha256: uploaded.sha256,
      createdAt: Date.now(),
    });
    retainProgressPublishArtifact(artifact);
    await dependencies.assertOwner(snapshot.ownerId);
  }
  await dependencies.revalidateSources(snapshot, draft);
  await dependencies.assertOwner(snapshot.ownerId);
  const shareData = buildProgressShareData(snapshot, draft, artifact.sha256);
  const body = progressPostBody(snapshot, draft);
  const postId = await dependencies.createPost(
    body,
    artifact.mediaRef,
    null,
    null,
    null,
    draft.showPublicly,
    {
      showPublicly: draft.showPublicly,
      postType: 'milestone',
      shareData,
      operationId: draft.operationId,
      expectedOwnerId: snapshot.ownerId,
    },
  );
  await dependencies.assertOwner(snapshot.ownerId);
  dependencies.markFeedPostPublished(snapshot.ownerId, postId);
  await dependencies.clearUploadedRecovery(snapshot.ownerId, draft.operationId);
  publishArtifacts.delete(`${snapshot.ownerId}:${draft.operationId}`);
  return postId;
}

export type ProgressPublishCancelResult =
  | Readonly<{ status: 'cancelled' }>
  | Readonly<{ status: 'published'; postId: string }>;

/** Reconciles a possibly committed post before deleting its exact derivative. */
export async function cancelProgressPublish(
  input: Readonly<{ snapshot: ProgressShareSnapshot; draft: ShareStudioResult }>,
  dependencyOverrides: Partial<ProgressPostDependencies> = {},
): Promise<ProgressPublishCancelResult> {
  assertFrozenDraftIdentity(input.snapshot, input.draft);
  const snapshot = progressShareSnapshotForDraft(input.snapshot, input.draft);
  const fingerprint = progressDraftFingerprint(snapshot, input.draft);
  const key = `${snapshot.ownerId}:${input.draft.operationId}`;
  const inFlight = inFlightPublishes.get(key);
  if (inFlight) throw new Error('Wait for sharing to finish before cancelling.');
  const artifact = publishArtifacts.get(key);
  if (!artifact) return { status: 'cancelled' };
  if (artifact.draftFingerprint !== fingerprint) {
    throw new Error('This progress share changed after review.');
  }
  if (artifact.stage === 'captured') {
    publishArtifacts.delete(key);
    return { status: 'cancelled' };
  }

  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  await dependencies.assertOwner(snapshot.ownerId);
  const shareData = buildProgressShareData(snapshot, input.draft, artifact.sha256);
  const body = progressPostBody(snapshot, input.draft);
  const postId = await dependencies.findExistingPost({
    ownerId: snapshot.ownerId,
    operationId: input.draft.operationId,
    body,
    mediaRef: artifact.mediaRef,
    showPublicly: input.draft.showPublicly,
    shareData,
  });
  await dependencies.assertOwner(snapshot.ownerId);
  if (postId) {
    dependencies.markFeedPostPublished(snapshot.ownerId, postId);
    await dependencies.clearUploadedRecovery(snapshot.ownerId, input.draft.operationId);
    publishArtifacts.delete(key);
    return { status: 'published', postId };
  }
  try {
    await dependencies.deleteDerivedImage(
      artifact.mediaRef,
      artifact.sha256,
      input.draft.operationId,
      snapshot.ownerId,
    );
    await dependencies.assertOwner(snapshot.ownerId);
    await dependencies.clearUploadedRecovery(snapshot.ownerId, input.draft.operationId);
    publishArtifacts.delete(key);
    return { status: 'cancelled' };
  } catch (error) {
    publishArtifacts.set(key, Object.freeze({ ...artifact, cleanupPending: true }));
    await dependencies.updateUploadedRecoveryStatus(
      snapshot.ownerId,
      input.draft.operationId,
      'cleanup_pending',
    ).catch(() => {});
    throw new AggregateError([error], 'Cancel cleanup could not be confirmed. Try cancel again.');
  }
}

export async function resumeProgressShareRecovery(
  ownerId: string,
  dependencyOverrides: Partial<ProgressPostDependencies> = {},
): Promise<Readonly<{ resolved: number; pending: number }>> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  await dependencies.assertOwner(ownerId);
  const entries = await dependencies.listUploadedRecovery(ownerId);
  let resolved = 0;
  let pending = 0;
  for (const entry of entries) {
    try {
      await dependencies.assertOwner(ownerId);
      const postId = await dependencies.findPostByOperationId(entry.operationId, ownerId);
      await dependencies.assertOwner(ownerId);
      if (postId) {
        dependencies.markFeedPostPublished(ownerId, postId);
      } else {
        await dependencies.deleteDerivedImage(entry.mediaRef, entry.sha256, entry.operationId, ownerId);
        await dependencies.assertOwner(ownerId);
      }
      await dependencies.clearUploadedRecovery(ownerId, entry.operationId);
      resolved += 1;
    } catch {
      pending += 1;
      await dependencies.updateUploadedRecoveryStatus(ownerId, entry.operationId, 'cleanup_pending').catch(() => {});
    }
  }
  return Object.freeze({ resolved, pending });
}

async function assertCurrentOwner(expectedOwnerId: string): Promise<void> {
  const { data, error } = await supabase.auth.getUser();
  if (data.user?.id !== expectedOwnerId) throw new Error('Account changed.');
  if (error) throw error;
}

async function revalidateProgressShareSources(snapshot: ProgressShareSnapshot, draft: ShareStudioResult): Promise<void> {
  const [measurements, photos] = await Promise.all([
    draft.includeBodyStats ? listMeasurements(snapshot.ownerId, 52) : Promise.resolve([]),
    draft.media.kind === 'card' && snapshot.privatePhotos.length > 0
      ? listProgressPhotos(snapshot.ownerId)
      : Promise.resolve([]),
  ]);
  assertProgressShareSourcesCurrent(snapshot, draft, { measurements, photos });
}

export function assertProgressPhotoRowsCurrent(
  snapshot: ProgressShareSnapshot,
  current: readonly ProgressPhoto[],
): void {
  for (const expected of snapshot.privatePhotos) {
    const matching = current.find((photo) => photo.id === expected.id);
    if (!matching || matching.storagePath !== expected.storagePath || matching.capturedAt !== expected.capturedAt) {
      throw new Error('Your private progress photos changed. Review the share again.');
    }
  }
}

export function assertProgressShareSourcesCurrent(
  snapshot: ProgressShareSnapshot,
  draft: Pick<ShareStudioResult, 'includeBodyStats' | 'media'>,
  current: Readonly<{ measurements: readonly BodyMeasurement[]; photos: readonly ProgressPhoto[] }>,
): void {
  if (draft.includeBodyStats) {
    const expected = snapshot.bodyMeasurement;
    const matching = expected ? current.measurements.find((measurement) => measurement.id === expected.id) : null;
    if (!expected || !matching || matching.recordedAt !== expected.recordedAt ||
      matching.weightKg !== expected.weightKg || matching.heightCm !== expected.heightCm) {
      throw new Error('Your body progress changed. Review the share again.');
    }
  }
  if (draft.media.kind === 'card') assertProgressPhotoRowsCurrent(snapshot, current.photos);
}

function assertFrozenDraftIdentity(snapshot: ProgressShareSnapshot, draft: ShareStudioResult): void {
  if (draft.ownerId !== snapshot.ownerId) throw new Error('Account changed.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(draft.operationId)) {
    throw new Error('The share operation is invalid.');
  }
  const expectedContext = canonicalShareStudioContext(snapshot.context, draft.includeBodyStats);
  if (JSON.stringify(draft.context) !== JSON.stringify(expectedContext)) {
    throw new Error('This progress share changed after the reviewed draft.');
  }
  const expectedVisibility = postVisibility(draft.showPublicly);
  if (
    draft.visibility.audience !== expectedVisibility.audience ||
    draft.visibility.showOnCard !== expectedVisibility.showOnCard
  ) {
    throw new Error('The reviewed visibility changed.');
  }
}

function progressDraftFingerprint(snapshot: ProgressShareSnapshot, draft: ShareStudioResult): string {
  return JSON.stringify({
    ownerId: snapshot.ownerId,
    period: snapshot.period,
    openedAt: snapshot.openedAt,
    totals: [snapshot.workouts, snapshot.activeDays, snapshot.tasksDone, snapshot.weightKg, snapshot.bmi],
    bodyMeasurement: snapshot.bodyMeasurement,
    privatePhotos: draft.media.kind === 'card'
      ? snapshot.privatePhotos.map((photo) => [photo.id, photo.storagePath, photo.capturedAt, photo.localUri])
      : [],
    operationId: draft.operationId,
    context: draft.context,
    caption: draft.caption,
    showPublicly: draft.showPublicly,
    includeBodyStats: draft.includeBodyStats,
    media: draft.media.kind === 'card' ? { kind: 'card' } : {
      kind: 'photo', source: draft.media.source, uri: draft.media.uri,
      width: draft.media.width, height: draft.media.height, capturedAt: draft.media.capturedAt,
    },
  });
}

function retainProgressPublishArtifact(artifact: ProgressPublishArtifact): void {
  pruneProgressPublishArtifacts();
  const key = `${artifact.ownerId}:${artifact.operationId}`;
  publishArtifacts.delete(key);
  if (artifact.stage === 'captured') {
    const captures = [...publishArtifacts.values()].filter(
      (candidate): candidate is CapturedProgressArtifact => candidate.stage === 'captured',
    );
    const captureBytes = captures.reduce((total, candidate) => total + candidate.byteLength, 0);
    if (captures.length >= CAPTURE_ARTIFACT_LIMIT || captureBytes + artifact.byteLength > CAPTURE_ARTIFACT_TOTAL_BYTES) {
      throw new Error('Finish or cancel the current progress share before creating another.');
    }
  } else if (publishArtifacts.size >= ARTIFACT_LIMIT) {
    throw new Error('Finish or cancel an earlier progress share before posting another.');
  }
  publishArtifacts.set(key, artifact);
}

function pruneProgressPublishArtifacts(now = Date.now()): void {
  for (const [key, artifact] of publishArtifacts) {
    if (artifact.stage === 'captured' && now - artifact.createdAt > ARTIFACT_MAX_AGE_MS) publishArtifacts.delete(key);
  }
}

function progressPostBody(snapshot: ProgressShareSnapshot, draft: ShareStudioResult): string {
  return draft.caption || `Sharing my ${snapshot.period === 'week' ? 'weekly' : 'monthly'} progress.`;
}

function recoveryArtifactFingerprint(operationId: string, sha256: string): string {
  return `${operationId}:${sha256}`;
}

export function validateProgressShareJpeg(base64: string): Readonly<{
  bytes: Uint8Array;
  width: number;
  height: number;
}> {
  if (!base64) throw new Error('The captured JPEG is empty.');
  if (base64.length > Math.ceil(PROGRESS_SHARE_MAX_JPEG_BYTES / 3) * 4 + 4) {
    throw new Error('The captured JPEG is too large.');
  }
  if (base64.length % 4 !== 0 || !BASE64.test(base64)) throw new Error('The captured JPEG encoding is invalid.');
  const bytes = new Uint8Array(decode(base64));
  if (bytes.byteLength === 0) throw new Error('The captured JPEG is empty.');
  if (bytes.byteLength > PROGRESS_SHARE_MAX_JPEG_BYTES) throw new Error('The captured JPEG is too large.');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error('The captured image is not a JPEG.');
  }
  if (bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new Error('The captured JPEG is incomplete.');
  }

  let offset = 2;
  let width: number | null = null;
  let height: number | null = null;
  let sawScan = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) throw new Error('The captured JPEG structure is invalid.');
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0xda) {
      if (offset + 2 > bytes.length) throw new Error('The captured JPEG scan is incomplete.');
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length - 2) throw new Error('The captured JPEG scan is invalid.');
      sawScan = true;
      break;
    }
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > bytes.length) throw new Error('The captured JPEG segment is incomplete.');
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length - 2) throw new Error('The captured JPEG segment is invalid.');
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      if (length < 8) throw new Error('The captured JPEG dimensions are invalid.');
      height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      width = (bytes[offset + 5] << 8) | bytes[offset + 6];
    }
    offset += length;
  }
  if (!sawScan || width === null || height === null) throw new Error('The captured JPEG structure is incomplete.');
  if (width !== PROGRESS_SHARE_WIDTH || height !== PROGRESS_SHARE_HEIGHT) {
    throw new Error(`The progress JPEG must be exactly ${PROGRESS_SHARE_WIDTH}x${PROGRESS_SHARE_HEIGHT}.`);
  }
  return Object.freeze({ bytes, width, height });
}

function safeCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Progress totals must be valid.');
  return Math.round(value);
}

function assertSnapshotBodySource(input: ProgressSnapshotInput): void {
  const source = input.bodyMeasurement;
  if (input.weightKg === null || input.bmi === null) {
    if (input.weightKg !== null || input.bmi !== null || source !== null) {
      throw new Error('The body measurement source is incomplete.');
    }
    return;
  }
  if (!source || source.weightKg !== input.weightKg || calculateBmi(source.weightKg, source.heightCm) !== input.bmi) {
    throw new Error('The body measurement source does not match the reviewed values.');
  }
}
