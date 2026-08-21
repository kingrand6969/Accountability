import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import { supabase } from '../lib/supabase';
import { assertValidBodyValues } from './bmi';
import type {
  AddMeasurementInput,
  BodyMeasurement,
  ProgressPhoto,
  SaveProgressPhotoInput,
} from './types';

const MEASUREMENT_COLUMNS = 'id,user_id,recorded_at,weight_kg,height_cm';
const PHOTO_COLUMNS = 'id,user_id,storage_path,captured_at,weight_kg';
const DELETE_PHOTO_COLUMNS = 'id,user_id,storage_path';
const PROGRESS_PHOTO_BUCKET = 'progress-photos';
const INVALID_PROGRESS_DATA = 'Progress data could not be verified.';
const INVALID_PROGRESS_PHOTO = 'Progress photo could not be verified.';
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const LOCAL_URI = /^(?:file|content|ph|assets-library):\/\//i;

type DatabaseResponse = {
  readonly data: unknown;
  readonly error: unknown;
  readonly status?: number;
};

type ProgressQuery = PromiseLike<DatabaseResponse> & {
  select(columns: string): ProgressQuery;
  eq(column: string, value: unknown): ProgressQuery;
  order(column: string, options: { ascending: boolean }): ProgressQuery;
  limit(value: number): PromiseLike<DatabaseResponse>;
  insert(value: unknown): ProgressQuery;
  delete(): ProgressQuery;
  single(): Promise<DatabaseResponse>;
  maybeSingle(): Promise<DatabaseResponse>;
};

type StorageBucket = {
  upload(
    path: string,
    body: ArrayBuffer,
    options: { contentType: string; upsert: boolean },
  ): Promise<DatabaseResponse>;
  remove(paths: string[]): Promise<DatabaseResponse>;
};

type ProgressClient = {
  readonly auth: {
    getUser(): Promise<{
      readonly data: { readonly user: { readonly id?: string } | null };
      readonly error: unknown;
    }>;
  };
  from(table: string): ProgressQuery;
  readonly storage: { from(bucket: string): StorageBucket };
};

export type ProgressApiDependencies = {
  readonly client: ProgressClient;
  readonly readLocalImage: (
    localUri: string,
  ) => Promise<{ readonly bytes: ArrayBuffer; readonly contentType: string }>;
  readonly randomUUID: () => string;
};

const defaultDependencies: ProgressApiDependencies = {
  client: supabase as unknown as ProgressClient,
  async readLocalImage(localUri) {
    const file = new File(localUri);
    return {
      bytes: await file.arrayBuffer(),
      contentType: safeImageContentType(file.type),
    };
  },
  randomUUID: Crypto.randomUUID,
};

export async function listMeasurements(
  expectedOwnerId: string,
  limit = 52,
  deps: ProgressApiDependencies = defaultDependencies,
): Promise<BodyMeasurement[]> {
  await assertOwner(expectedOwnerId, deps);
  const safeLimit = Math.min(104, Math.max(1, Math.trunc(Number.isFinite(limit) ? limit : 52)));
  const { data, error } = await withOwnerRecheck(
    () =>
      deps.client
        .from('body_measurements')
        .select(MEASUREMENT_COLUMNS)
        .eq('user_id', expectedOwnerId)
        .order('recorded_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(safeLimit),
    expectedOwnerId,
    deps,
  );
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error(INVALID_PROGRESS_DATA);
  return data.map((row) => mapMeasurement(row, expectedOwnerId));
}

export async function addMeasurement(
  input: AddMeasurementInput,
  expectedOwnerId: string,
  deps: ProgressApiDependencies = defaultDependencies,
): Promise<BodyMeasurement> {
  await assertOwner(expectedOwnerId, deps);
  assertValidBodyValues(input.weightKg, input.heightCm);
  const recordedAt = validIsoDate(input.recordedAt, INVALID_PROGRESS_DATA);
  const { data, error } = await withOwnerRecheck(
    () =>
      deps.client
        .from('body_measurements')
        .insert({
          user_id: expectedOwnerId,
          recorded_at: recordedAt,
          weight_kg: input.weightKg,
          height_cm: input.heightCm,
        })
        .select(MEASUREMENT_COLUMNS)
        .single(),
    expectedOwnerId,
    deps,
  );
  if (error) throw error;
  return mapMeasurement(data, expectedOwnerId);
}

export async function listProgressPhotos(
  expectedOwnerId: string,
  deps: ProgressApiDependencies = defaultDependencies,
): Promise<ProgressPhoto[]> {
  await assertOwner(expectedOwnerId, deps);
  const { data, error } = await withOwnerRecheck(
    () =>
      deps.client
        .from('progress_photos')
        .select(PHOTO_COLUMNS)
        .eq('user_id', expectedOwnerId)
        .order('captured_at', { ascending: false })
        .order('id', { ascending: false }),
    expectedOwnerId,
    deps,
  );
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error(INVALID_PROGRESS_DATA);
  return data.map((row) => mapProgressPhoto(row, expectedOwnerId));
}

export async function saveProgressPhoto(
  input: SaveProgressPhotoInput,
  expectedOwnerId: string,
  operationId?: string,
  deps: ProgressApiDependencies = defaultDependencies,
): Promise<ProgressPhoto> {
  await assertOwner(expectedOwnerId, deps);
  validateLocalUri(input.localUri);
  const capturedAt = validIsoDate(input.capturedAt, INVALID_PROGRESS_PHOTO);
  validateOptionalWeight(input.weightKg);
  const identity = operationId ?? deps.randomUUID();
  if (!UUID_V4.test(identity)) throw new Error(INVALID_PROGRESS_PHOTO);

  const image = await withOwnerRecheck(
    () => deps.readLocalImage(input.localUri),
    expectedOwnerId,
    deps,
  );
  const contentType = safeImageContentType(image.contentType);
  const storagePath = progressPhotoPath(expectedOwnerId, identity);
  const existing = await findPhotoByPath(storagePath, expectedOwnerId, deps);
  if (existing) {
    confirmEquivalentPhoto(existing, capturedAt, input.weightKg);
    return existing;
  }

  const storage = deps.client.storage.from(PROGRESS_PHOTO_BUCKET);
  const upload = await withOwnerRecheck(
    () =>
      storage.upload(storagePath, image.bytes, {
        contentType,
        upsert: false,
      }),
    expectedOwnerId,
    deps,
  );
  if (upload.error && !isExistingObjectConflict(upload.error)) {
    throw upload.error;
  }

  const payload = {
    user_id: expectedOwnerId,
    storage_path: storagePath,
    captured_at: capturedAt,
    weight_kg: input.weightKg,
  };
  let insert: DatabaseResponse;
  try {
    insert = await withOwnerRecheck(
      () =>
        deps.client
          .from('progress_photos')
          .insert(payload)
          .select(PHOTO_COLUMNS)
          .single(),
      expectedOwnerId,
      deps,
    );
  } catch (insertError) {
    if (isAccountChangedError(insertError)) throw insertError;
    return recoverPhotoInsert(storagePath, capturedAt, input.weightKg, expectedOwnerId, insertError, undefined, storage, deps);
  }
  if (insert.error) {
    return recoverPhotoInsert(storagePath, capturedAt, input.weightKg, expectedOwnerId, insert.error, insert.status, storage, deps);
  }
  return mapProgressPhoto(insert.data, expectedOwnerId);
}

export async function deleteProgressPhoto(
  photo: ProgressPhoto,
  expectedOwnerId: string,
  deps: ProgressApiDependencies = defaultDependencies,
): Promise<void> {
  await assertOwner(expectedOwnerId, deps);
  assertOwnerStoragePath(photo.storagePath, expectedOwnerId);
  if (typeof photo.id !== 'string' || photo.id.length === 0) {
    throw new Error(INVALID_PROGRESS_PHOTO);
  }
  const { data, error } = await withOwnerRecheck(
    () =>
      deps.client
        .from('progress_photos')
        .delete()
        .eq('id', photo.id)
        .eq('user_id', expectedOwnerId)
        .eq('storage_path', photo.storagePath)
        .select(DELETE_PHOTO_COLUMNS)
        .maybeSingle(),
    expectedOwnerId,
    deps,
  );
  if (error) throw error;
  if (!isRecord(data) || data.id !== photo.id || data.user_id !== expectedOwnerId || data.storage_path !== photo.storagePath) {
    throw new Error(INVALID_PROGRESS_PHOTO);
  }
  const removal = await withOwnerRecheck(
    () =>
      deps.client.storage
        .from(PROGRESS_PHOTO_BUCKET)
        .remove([photo.storagePath]),
    expectedOwnerId,
    deps,
  );
  if (removal.error) throw removal.error;
}

async function assertOwner(
  expectedOwnerId: string,
  deps: ProgressApiDependencies,
): Promise<void> {
  const { data, error } = await deps.client.auth.getUser();
  const currentOwnerId = data.user?.id;
  if (!currentOwnerId) throw new Error('Not signed in.');
  if (currentOwnerId !== expectedOwnerId) throw new Error('Account changed.');
  if (error) throw error;
}

async function findPhotoByPath(
  storagePath: string,
  expectedOwnerId: string,
  deps: ProgressApiDependencies,
): Promise<ProgressPhoto | null> {
  assertOwnerStoragePath(storagePath, expectedOwnerId);
  const { data, error } = await withOwnerRecheck(
    () =>
      deps.client
        .from('progress_photos')
        .select(PHOTO_COLUMNS)
        .eq('user_id', expectedOwnerId)
        .eq('storage_path', storagePath)
        .maybeSingle(),
    expectedOwnerId,
    deps,
  );
  if (error) throw error;
  return data == null ? null : mapProgressPhoto(data, expectedOwnerId);
}

async function recoverPhotoInsert(
  storagePath: string,
  capturedAt: string,
  weightKg: number | null,
  expectedOwnerId: string,
  insertError: unknown,
  insertStatus: number | undefined,
  storage: StorageBucket,
  deps: ProgressApiDependencies,
): Promise<ProgressPhoto> {
  await assertOwner(expectedOwnerId, deps);
  let confirmed: ProgressPhoto | null;
  try {
    confirmed = await findPhotoByPath(storagePath, expectedOwnerId, deps);
  } catch (confirmationError) {
    if (isAccountChangedError(confirmationError)) throw confirmationError;
    throw new AggregateError(
      [insertError, confirmationError],
      'The progress photo may have saved, but it could not be confirmed.',
    );
  }
  if (confirmed) {
    confirmEquivalentPhoto(confirmed, capturedAt, weightKg);
    return confirmed;
  }

  if (!isDefinitelyRejected(insertError, insertStatus)) throw insertError;
  const cleanup = await withOwnerRecheck(
    () => storage.remove([storagePath]),
    expectedOwnerId,
    deps,
  );
  if (cleanup.error) {
    throw new AggregateError(
      [insertError, cleanup.error],
      'The progress photo failed to save and its upload could not be cleaned up.',
    );
  }
  throw insertError;
}

function confirmEquivalentPhoto(
  photo: ProgressPhoto,
  capturedAt: string,
  weightKg: number | null,
): void {
  if (photo.capturedAt !== capturedAt || photo.weightKg !== weightKg) {
    throw new Error(INVALID_PROGRESS_PHOTO);
  }
}

function mapMeasurement(row: unknown, expectedOwnerId: string): BodyMeasurement {
  if (!isRecord(row) || typeof row.id !== 'string' || row.id.length === 0 || row.user_id !== expectedOwnerId) {
    throw new Error(INVALID_PROGRESS_DATA);
  }
  const recordedAt = validIsoDate(row.recorded_at, INVALID_PROGRESS_DATA);
  const weightKg = databaseNumber(row.weight_kg);
  const heightCm = databaseNumber(row.height_cm);
  if (weightKg === null || heightCm === null) throw new Error(INVALID_PROGRESS_DATA);
  try {
    assertValidBodyValues(weightKg, heightCm);
  } catch {
    throw new Error(INVALID_PROGRESS_DATA);
  }
  return { id: row.id, recordedAt, weightKg, heightCm };
}

function mapProgressPhoto(row: unknown, expectedOwnerId: string): ProgressPhoto {
  if (!isRecord(row) || typeof row.id !== 'string' || row.id.length === 0 || row.user_id !== expectedOwnerId || typeof row.storage_path !== 'string') {
    throw new Error(INVALID_PROGRESS_DATA);
  }
  assertOwnerStoragePath(row.storage_path, expectedOwnerId, INVALID_PROGRESS_DATA);
  const capturedAt = validIsoDate(row.captured_at, INVALID_PROGRESS_DATA);
  const weightKg = row.weight_kg === null ? null : databaseNumber(row.weight_kg);
  if (row.weight_kg !== null && weightKg === null) throw new Error(INVALID_PROGRESS_DATA);
  validateOptionalWeight(weightKg, INVALID_PROGRESS_DATA);
  return { id: row.id, storagePath: row.storage_path, capturedAt, weightKg };
}

function databaseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDefinitelyRejected(error: unknown, responseStatus?: number): boolean {
  const status = responseStatus ?? errorStatus(error);
  if (status !== null) return status >= 400 && status < 500 && status !== 408;
  if (!isRecord(error) || typeof error.code !== 'string') return false;
  return /^(?:23|22|PGRST)/.test(error.code);
}

function isExistingObjectConflict(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const status = databaseNumber(error.statusCode ?? error.status);
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return status === 409 && /(?:already exists|duplicate)/.test(message);
}

function errorStatus(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const status = databaseNumber(error.status);
  return status !== null && Number.isInteger(status) ? status : null;
}

function validIsoDate(value: unknown, message: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) throw new Error(message);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(message);
  return new Date(milliseconds).toISOString();
}

function validateOptionalWeight(
  weightKg: number | null,
  message = 'Enter valid weight and height values.',
): void {
  if (weightKg === null) return;
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 500) {
    throw new Error(message);
  }
}

function validateLocalUri(localUri: string): void {
  if (typeof localUri !== 'string' || localUri !== localUri.trim() || !LOCAL_URI.test(localUri)) {
    throw new Error(INVALID_PROGRESS_PHOTO);
  }
}

function assertOwnerStoragePath(
  storagePath: string,
  expectedOwnerId: string,
  message = INVALID_PROGRESS_PHOTO,
): void {
  const prefix = `${expectedOwnerId}/`;
  const filename = storagePath.startsWith(prefix)
    ? storagePath.slice(prefix.length)
    : '';
  const identity = filename.endsWith('.jpg') ? filename.slice(0, -4) : '';
  if (storagePath !== `${prefix}${identity}.jpg` || !UUID_V4.test(identity)) {
    throw new Error(message);
  }
}

function progressPhotoPath(expectedOwnerId: string, identity: string): string {
  const storagePath = `${expectedOwnerId}/${identity}.jpg`;
  assertOwnerStoragePath(storagePath, expectedOwnerId);
  return storagePath;
}

function safeImageContentType(value: string): 'image/jpeg' | 'image/png' {
  return value.toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function withOwnerRecheck<T>(
  operation: () => PromiseLike<T>,
  expectedOwnerId: string,
  deps: ProgressApiDependencies,
): Promise<T> {
  let result: T;
  try {
    result = await operation();
  } catch (operationError) {
    await assertOwner(expectedOwnerId, deps);
    throw operationError;
  }
  await assertOwner(expectedOwnerId, deps);
  return result;
}

function isAccountChangedError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Account changed.';
}
