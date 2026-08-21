import { createPost } from '../feed/api';
import { markFeedPostPublished } from '../feed/feedPublishSignal';
import { uploadPostImageWithDigest } from '../feed/uploadPostImage';
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

const SHA256_HEX = /^[0-9a-f]{64}$/u;

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
  createPost: typeof createPost;
  markFeedPostPublished: typeof markFeedPostPublished;
};

const defaultDependencies: ProgressPostDependencies = {
  assertOwner: assertCurrentOwner,
  revalidateSources: revalidateProgressShareSources,
  async captureCard() {
    throw new Error('The reviewed progress card is not ready.');
  },
  uploadDerivedImage: uploadPostImageWithDigest,
  createPost,
  markFeedPostPublished,
};

const inFlightPublishes = new Map<string, Readonly<{ fingerprint: string; promise: Promise<string> }>>();
type ProgressPublishArtifact = Readonly<{
  ownerId: string;
  operationId: string;
  draftFingerprint: string;
  mediaRef: string;
  sha256: string;
  createdAt: number;
}>;
const ARTIFACT_LIMIT = 8;
const ARTIFACT_MAX_AGE_MS = 30 * 60 * 1000;
const publishArtifacts = new Map<string, ProgressPublishArtifact>();

export function clearProgressPublishArtifacts(ownerId?: string, operationId?: string): void {
  for (const [key, artifact] of publishArtifacts) {
    if ((ownerId === undefined || artifact.ownerId === ownerId) &&
      (operationId === undefined || artifact.operationId === operationId)) publishArtifacts.delete(key);
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
    publishArtifacts.delete(key);
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
    await dependencies.assertOwner(snapshot.ownerId);
    await dependencies.revalidateSources(snapshot, draft);
    await dependencies.assertOwner(snapshot.ownerId);
    const uploaded = await dependencies.uploadDerivedImage(base64, 'jpg', draft.operationId, snapshot.ownerId);
    await dependencies.assertOwner(snapshot.ownerId);
    artifact = Object.freeze({
      ownerId: snapshot.ownerId,
      operationId: draft.operationId,
      draftFingerprint,
      mediaRef: uploaded.mediaRef,
      sha256: uploaded.sha256,
      createdAt: Date.now(),
    });
    retainProgressPublishArtifact(artifact);
  }
  await dependencies.revalidateSources(snapshot, draft);
  await dependencies.assertOwner(snapshot.ownerId);
  const shareData = buildProgressShareData(snapshot, draft, artifact.sha256);
  const body = draft.caption || `Sharing my ${snapshot.period === 'week' ? 'weekly' : 'monthly'} progress.`;
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
  publishArtifacts.delete(`${snapshot.ownerId}:${draft.operationId}`);
  return postId;
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
  publishArtifacts.set(key, artifact);
  while (publishArtifacts.size > ARTIFACT_LIMIT) {
    const oldest = publishArtifacts.keys().next().value as string | undefined;
    if (!oldest) break;
    publishArtifacts.delete(oldest);
  }
}

function pruneProgressPublishArtifacts(now = Date.now()): void {
  for (const [key, artifact] of publishArtifacts) {
    if (now - artifact.createdAt > ARTIFACT_MAX_AGE_MS) publishArtifacts.delete(key);
  }
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
