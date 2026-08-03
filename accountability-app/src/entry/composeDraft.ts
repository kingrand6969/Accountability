import { Directory, File, Paths } from 'expo-file-system';

export type ComposeDraftKind = 'new' | 'edit';
export type ComposeDraftOrigin = 'hub' | 'post' | 'photo' | 'event' | 'edit';
export type DraftQueryIdentity = {
  photo: boolean;
  event: boolean;
  text: string | null;
  edit: string | null;
};
export type DurableDraftMedia = {
  uri: string;
  extension: string;
  mimeType: string;
  byteCount: number;
  sha256: string;
  kind: 'photo' | 'video';
};
export type ComposeDraftV1 = {
  version: 1;
  draftId: string;
  ownerId: string;
  kind: ComposeDraftKind;
  editingId: string | null;
  origin: ComposeDraftOrigin;
  queryIdentity: DraftQueryIdentity;
  body: string;
  audience: 'buddies' | 'public';
  media: DurableDraftMedia | null;
  event: { open: boolean; title: string; date: string; time: string; location: string };
  tagIds: string[];
  keepInMemories: boolean;
  updatedAt: string;
};
export type DraftContext = Pick<ComposeDraftV1, 'kind' | 'editingId' | 'origin' | 'queryIdentity'>;
export type DraftTrigger =
  | 'field-change' | 'background' | 'process-recovery' | 'explicit-cancel'
  | 'successful-post' | 'successful-edit' | 'hardware-back' | 'upload-error' | 'account-switch';
export type DraftEffect = 'save' | 'clear' | 'keep' | 'detach';

export function selectDraftCleanupTarget(
  submitted: ComposeDraftV1 | null | undefined,
  current: ComposeDraftV1 | null,
  retained: ComposeDraftV1 | null,
): ComposeDraftV1 | null {
  return submitted === undefined ? current ?? retained : submitted;
}

export function composeDraftKey(ownerId: string, kind: ComposeDraftKind, draftId: string): string {
  return `compose-draft:v1:${ownerId}:${kind}:${draftId}`;
}

export function composeDraftIndexKey(ownerId: string): string {
  return `compose-draft-index:v1:${ownerId}`;
}
function composeDraftPendingKey(ownerId: string): string {
  return `compose-draft-pending:v1:${ownerId}`;
}

export type DraftStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function parseIndex(raw: string | null, ownerId: string): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    const prefix = `compose-draft:v1:${ownerId}:`;
    return Array.isArray(value) ? [...new Set(value.filter((key): key is string => typeof key === 'string' && key.startsWith(prefix)))] : [];
  } catch {
    return [];
  }
}

const ownerQueues = new Map<string, Promise<void>>();
async function withOwnerLock<T>(ownerId: string, action: () => Promise<T>): Promise<T> {
  const previous = ownerQueues.get(ownerId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  ownerQueues.set(ownerId, queued);
  await previous;
  try { return await action(); } finally {
    release();
    if (ownerQueues.get(ownerId) === queued) ownerQueues.delete(ownerId);
  }
}

async function saveComposeDraftUnlocked(draft: ComposeDraftV1, storage: DraftStorage): Promise<void> {
  if (!parseComposeDraft(JSON.stringify(draft), draft.ownerId)) throw new Error('Invalid compose draft');
  const key = composeDraftKey(draft.ownerId, draft.kind, draft.draftId);
  const indexKey = composeDraftIndexKey(draft.ownerId);
  const pendingKey = composeDraftPendingKey(draft.ownerId);
  const index = parseIndex(await storage.getItem(indexKey), draft.ownerId);
  await storage.setItem(pendingKey, key);
  await storage.setItem(key, JSON.stringify(draft));
  if (!index.includes(key)) await storage.setItem(indexKey, JSON.stringify([...index, key]));
  await storage.removeItem(pendingKey);
}
export async function saveComposeDraft(draft: ComposeDraftV1, storage: DraftStorage): Promise<void> {
  return withOwnerLock(draft.ownerId, () => saveComposeDraftUnlocked(draft, storage));
}

async function loadComposeDraftsUnlocked(ownerId: string, storage: DraftStorage, adapter?: DraftFileAdapter): Promise<{ drafts: ComposeDraftV1[]; cleanedInvalid: number }> {
  if (!isUuid(ownerId)) return { drafts: [], cleanedInvalid: 0 };
  const indexKey = composeDraftIndexKey(ownerId);
  const keys = parseIndex(await storage.getItem(indexKey), ownerId);
  const pendingKey = composeDraftPendingKey(ownerId);
  const pending = await storage.getItem(pendingKey);
  const prefix = `compose-draft:v1:${ownerId}:`;
  if (pending?.startsWith(prefix) && !keys.includes(pending) && await storage.getItem(pending)) {
    keys.push(pending);
    await storage.setItem(indexKey, JSON.stringify(keys));
  }
  if (pending) await storage.removeItem(pendingKey);
  const drafts: ComposeDraftV1[] = [];
  const retained: string[] = [];
  let cleanedInvalid = 0;
  for (const key of keys) {
    const raw = await storage.getItem(key);
    const draft = raw ? parseComposeDraft(raw, ownerId) : null;
    if (draft) {
      drafts.push(draft);
      retained.push(key);
      if (adapter) await cleanupOrphanTemps(ownerId, draft.draftId, adapter);
    } else {
      await storage.removeItem(key);
      cleanedInvalid += 1;
    }
  }
  if (retained.length !== keys.length) await storage.setItem(indexKey, JSON.stringify(retained));
  return { drafts: drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), cleanedInvalid };
}
export async function loadComposeDrafts(ownerId: string, storage: DraftStorage, adapter?: DraftFileAdapter) {
  return withOwnerLock(ownerId, () => loadComposeDraftsUnlocked(ownerId, storage, adapter));
}

async function clearComposeDraftUnlocked(draft: ComposeDraftV1, storage: DraftStorage): Promise<void> {
  const key = composeDraftKey(draft.ownerId, draft.kind, draft.draftId);
  const indexKey = composeDraftIndexKey(draft.ownerId);
  const index = parseIndex(await storage.getItem(indexKey), draft.ownerId).filter((item) => item !== key);
  await storage.removeItem(key);
  if (index.length) await storage.setItem(indexKey, JSON.stringify(index));
  else await storage.removeItem(indexKey);
}
export async function clearComposeDraft(draft: ComposeDraftV1, storage: DraftStorage): Promise<void> {
  return withOwnerLock(draft.ownerId, () => clearComposeDraftUnlocked(draft, storage));
}

export async function runForCurrentOwner(
  expectedOwner: string,
  currentOwner: () => string | null,
  action: () => Promise<void>,
): Promise<boolean> {
  if (currentOwner() !== expectedOwner) return false;
  await action();
  return currentOwner() === expectedOwner;
}

export async function restoreForCurrentOwner<T>(
  expectedOwner: string,
  currentOwner: () => string | null,
  prepare: () => Promise<T>,
  apply: (prepared: T) => void,
  onError: (message: string) => void,
): Promise<boolean> {
  if (currentOwner() !== expectedOwner) return false;
  try {
    const prepared = await prepare();
    if (currentOwner() !== expectedOwner) return false;
    apply(prepared);
    return true;
  } catch (error) {
    if (currentOwner() === expectedOwner) onError(String((error as Error).message ?? error));
    return false;
  }
}

export async function completeRemoteSubmission<T>(
  remote: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<{ remoteSucceeded: true; value: T; cleanupError: string | null }> {
  const value = await remote();
  try {
    await cleanup();
    return { remoteSucceeded: true, value, cleanupError: null };
  } catch (error) {
    return { remoteSucceeded: true, value, cleanupError: String((error as Error).message ?? error) };
  }
}

export function resolveDraftContext(query: { photo?: unknown; event?: unknown; text?: unknown; edit?: unknown }): DraftContext {
  const edit = typeof query.edit === 'string' && query.edit.length > 0 ? query.edit : null;
  const event = query.event === '1';
  const photo = query.photo === '1';
  const text = typeof query.text === 'string' ? query.text : null;
  const origin: ComposeDraftOrigin = edit ? 'edit' : event ? 'event' : photo ? 'photo' : text !== null ? 'post' : 'hub';
  return {
    kind: edit ? 'edit' : 'new',
    editingId: edit,
    origin,
    queryIdentity: {
      edit,
      event: !edit && event,
      photo: !edit && !event && photo,
      text: !edit && !event && !photo ? text : null,
    },
  };
}

export function isCompatibleDraft(draft: ComposeDraftV1, context: DraftContext & { ownerId: string }): boolean {
  return draft.ownerId === context.ownerId &&
    draft.kind === context.kind &&
    draft.editingId === context.editingId &&
    draft.origin === context.origin &&
    JSON.stringify(draft.queryIdentity) === JSON.stringify(context.queryIdentity);
}

export function draftEffect(trigger: DraftTrigger): DraftEffect {
  if (trigger === 'field-change' || trigger === 'background' || trigger === 'process-recovery') return 'save';
  if (trigger === 'explicit-cancel' || trigger === 'successful-post' || trigger === 'successful-edit') return 'clear';
  if (trigger === 'account-switch') return 'detach';
  return 'keep';
}

export function parseComposeDraft(raw: string, expectedOwnerId: string): ComposeDraftV1 | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || value.ownerId !== expectedOwnerId) return null;
    if (typeof value.ownerId !== 'string' || typeof value.draftId !== 'string' ||
      !isUuid(value.ownerId) || !isUuid(value.draftId)) return null;
    if (value.kind !== 'new' && value.kind !== 'edit') return null;
    if (value.editingId !== null && typeof value.editingId !== 'string') return null;
    if (!['hub', 'post', 'photo', 'event', 'edit'].includes(String(value.origin))) return null;
    if (!validQuery(value.queryIdentity) || typeof value.body !== 'string') return null;
    if (value.audience !== 'buddies' && value.audience !== 'public') return null;
    if (value.media !== null && !validMedia(value.media, value.ownerId, value.draftId)) return null;
    if (!validEvent(value.event) || !Array.isArray(value.tagIds) || !value.tagIds.every((id) => typeof id === 'string')) return null;
    if (typeof value.keepInMemories !== 'boolean' || typeof value.updatedAt !== 'string') return null;
    const draft = value as ComposeDraftV1;
    const expected = resolveDraftContext({
      edit: draft.queryIdentity.edit ?? undefined,
      event: draft.queryIdentity.event ? '1' : undefined,
      photo: draft.queryIdentity.photo ? '1' : undefined,
      text: draft.queryIdentity.text ?? undefined,
    });
    return draft.kind === expected.kind && draft.editingId === expected.editingId && draft.origin === expected.origin ? draft : null;
  } catch {
    return null;
  }
}

function validQuery(value: unknown): value is DraftQueryIdentity {
  return isRecord(value) && typeof value.photo === 'boolean' && typeof value.event === 'boolean' &&
    (value.text === null || typeof value.text === 'string') && (value.edit === null || typeof value.edit === 'string');
}
function validEvent(value: unknown): value is ComposeDraftV1['event'] {
  return isRecord(value) && typeof value.open === 'boolean' && typeof value.title === 'string' &&
    typeof value.date === 'string' && typeof value.time === 'string' && typeof value.location === 'string';
}
function validMedia(value: unknown, ownerId: string, draftId: string): value is DurableDraftMedia {
  if (!isRecord(value) || typeof value.uri !== 'string' || !value.uri.includes(`/compose-drafts/${ownerId}/${draftId}/`)) return false;
  return validExtension(value.extension) && typeof value.mimeType === 'string' && typeof value.byteCount === 'number' &&
    value.byteCount > 0 && typeof value.sha256 === 'string' && /^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(value.sha256) &&
    (value.kind === 'photo' || value.kind === 'video') &&
    validMediaTuple(value.extension, value.mimeType, value.kind);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'webp', 'mp4', 'mov', 'webm']);
function isUuid(value: string): boolean {
  return value.length <= 36 && UUID.test(value);
}
function validExtension(value: unknown): value is string {
  return typeof value === 'string' && EXTENSIONS.has(value.toLowerCase());
}
export function validMediaTuple(extension: string, mimeType: string, kind: 'photo' | 'video'): boolean {
  const ext = extension.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (kind === 'photo') {
    return (['jpg', 'jpeg'].includes(ext) && mime === 'image/jpeg') ||
      (ext === 'png' && mime === 'image/png') ||
      (ext === 'webp' && mime === 'image/webp') ||
      (ext === 'heic' && (mime === 'image/heic' || mime === 'image/heif'));
  }
  return (ext === 'mp4' && mime === 'video/mp4') ||
    (ext === 'mov' && mime === 'video/quicktime') ||
    (ext === 'webm' && mime === 'video/webm');
}

export function durableMediaPath(documentUri: string, ownerId: string, draftId: string, sha256: string, extension: string) {
  if (!isUuid(ownerId) || !isUuid(draftId) || !/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(sha256) || !validExtension(extension)) {
    throw new Error('Invalid media path');
  }
  const ext = extension.toLowerCase();
  const root = documentUri.replace(/\/+$/, '');
  const directory = `${root}/compose-drafts/${ownerId}/${draftId}`;
  const final = `${directory}/${sha256}.${ext}`;
  return { directory, temporary: `${final}.tmp`, final };
}

export type DraftFileAdapter = {
  documentUri: string;
  availableBytes(): Promise<number>;
  sha256(sourceUri: string): Promise<string>;
  ensureDirectory(path: string): Promise<void>;
  copy(sourceUri: string, targetUri: string): Promise<void>;
  size(path: string): Promise<number>;
  readByte(path: string): Promise<number | null>;
  readPrefix(path: string, length: number): Promise<Uint8Array>;
  atomicMove(sourceUri: string, targetUri: string, overwrite: boolean): Promise<void>;
  deleteIfExists(path: string): Promise<void>;
  listNames(path: string): Promise<string[]>;
  deleteDirectoryIfExists(path: string): Promise<void>;
};

export type PersistMediaInput = {
  ownerId: string;
  draftId: string;
  sourceUri: string;
  extension: string;
  expectedBytes: number;
  maxBytes: number;
  mimeType?: string;
  kind?: 'photo' | 'video';
};

export async function persistDurableMedia(input: PersistMediaInput, adapter: DraftFileAdapter): Promise<{
  uri: string; sha256: string; byteCount: number;
}> {
  // Validate all user-derived path components before any adapter operation.
  if (!isUuid(input.ownerId) || !isUuid(input.draftId) || !validExtension(input.extension)) throw new Error('Invalid media path');
  await cleanupOrphanTemps(input.ownerId, input.draftId, adapter);
  if (!Number.isSafeInteger(input.expectedBytes) || input.expectedBytes <= 0) throw new Error('Media is empty');
  if (input.expectedBytes > input.maxBytes) throw new Error('Media is too large');
  if (await adapter.availableBytes() < input.expectedBytes * 2) throw new Error('Not enough storage space');
  if (!input.mimeType || !input.kind || !validMediaTuple(input.extension, input.mimeType, input.kind)) {
    throw new Error('Media type does not match its extension');
  }
  const signature = await adapter.readPrefix(input.sourceUri, 16);
  if (!matchesMediaSignature(input.extension, input.mimeType, input.kind, signature)) throw new Error('Media type does not match its contents');
  const sha256 = await adapter.sha256(input.sourceUri);
  const paths = durableMediaPath(adapter.documentUri, input.ownerId, input.draftId, sha256, input.extension);
  await adapter.ensureDirectory(paths.directory);
  try {
    await adapter.copy(input.sourceUri, paths.temporary);
    const byteCount = await adapter.size(paths.temporary);
    if (byteCount === 0) throw new Error('Copied media is empty');
    if (byteCount > input.maxBytes) throw new Error('Media is too large');
    if (byteCount !== input.expectedBytes) throw new Error('Media changed while copying');
    if (await adapter.readByte(paths.temporary) === null) throw new Error('Copied media could not be read');
    await adapter.atomicMove(paths.temporary, paths.final, true);
    return { uri: paths.final, sha256, byteCount };
  } catch (error) {
    await adapter.deleteIfExists(paths.temporary).catch(() => {});
    throw error;
  }
}

export async function persistDraftMedia(
  baseDraft: ComposeDraftV1,
  input: PersistMediaInput,
  storage: DraftStorage,
  adapter: DraftFileAdapter,
) {
  if (baseDraft.ownerId !== input.ownerId || baseDraft.draftId !== input.draftId) throw new Error('Invalid media path');
  await saveComposeDraft(baseDraft, storage);
  return persistDurableMedia(input, adapter);
}

export function createExpoDraftFileAdapter(): DraftFileAdapter {
  return {
    documentUri: Paths.document.uri,
    availableBytes: async () => Paths.availableDiskSpace,
    sha256: async (sourceUri) => {
      const nativeDigest = new File(sourceUri).md5;
      if (!nativeDigest) throw new Error('Media could not be hashed');
      return nativeDigest;
    },
    ensureDirectory: async (path) => { new Directory(path).create({ intermediates: true, idempotent: true }); },
    copy: async (source, target) => { await new File(source).copy(new File(target), { overwrite: true }); },
    size: async (path) => new File(path).size,
    readByte: async (path) => {
      const handle = new File(path).open();
      try {
        const bytes = handle.readBytes(1);
        return bytes.length === 1 ? bytes[0] : null;
      } finally {
        handle.close();
      }
    },
    readPrefix: async (path, length) => {
      const handle = new File(path).open();
      try { return handle.readBytes(length); } finally { handle.close(); }
    },
    atomicMove: async (source, target, overwrite) => { await new File(source).move(new File(target), { overwrite }); },
    deleteIfExists: async (path) => { const file = new File(path); if (file.exists) file.delete(); },
    listNames: async (path) => {
      const directory = new Directory(path);
      if (!directory.exists) return [];
      return directory.list().map((entry) => entry.name);
    },
    deleteDirectoryIfExists: async (path) => {
      const directory = new Directory(path);
      if (directory.exists) directory.delete();
    },
  };
}

export async function removeDurableMedia(media: DurableDraftMedia | null, adapter: DraftFileAdapter): Promise<void> {
  if (!media) return;
  const root = `${adapter.documentUri.replace(/\/+$/, '')}/compose-drafts/`;
  const expectedName = `/${media.sha256}.${media.extension.toLowerCase()}`;
  if (!media.uri.startsWith(root) || !media.uri.endsWith(expectedName)) throw new Error('Invalid media path');
  await adapter.deleteIfExists(media.uri);
}

const TEMP_NAME = /^(?:[a-f0-9]{32}|[a-f0-9]{64})\.(?:jpg|jpeg|png|heic|webp|mp4|mov|webm)\.tmp$/;

export async function cleanupOrphanTemps(ownerId: string, draftId: string, adapter: DraftFileAdapter): Promise<number> {
  if (!isUuid(ownerId) || !isUuid(draftId)) throw new Error('Invalid media path');
  const directory = `${adapter.documentUri.replace(/\/+$/, '')}/compose-drafts/${ownerId}/${draftId}`;
  const names = await adapter.listNames(directory);
  let cleaned = 0;
  for (const name of names) {
    if (!TEMP_NAME.test(name)) continue;
    await adapter.deleteIfExists(`${directory}/${name}`);
    cleaned += 1;
  }
  return cleaned;
}

export async function commitDraftMedia(
  previousDraft: ComposeDraftV1,
  nextMedia: DurableDraftMedia,
  storage: DraftStorage,
  adapter: DraftFileAdapter,
  stillAttached: () => boolean = () => true,
): Promise<ComposeDraftV1> {
  const nextDraft = { ...previousDraft, media: nextMedia, updatedAt: new Date().toISOString() };
  try {
    await saveComposeDraft(nextDraft, storage);
    if (!stillAttached()) {
      await saveComposeDraft(previousDraft, storage);
      await removeDurableMedia(nextMedia, adapter);
      throw new Error('Compose account detached');
    }
  } catch (error) {
    await removeDurableMedia(nextMedia, adapter).catch(() => {});
    throw error;
  }
  if (previousDraft.media && previousDraft.media.uri !== nextMedia.uri) {
    await removeDurableMedia(previousDraft.media, adapter);
  }
  return nextDraft;
}

export async function removeDraftMedia(
  draft: ComposeDraftV1,
  storage: DraftStorage,
  adapter: DraftFileAdapter,
): Promise<ComposeDraftV1> {
  const next = { ...draft, media: null, keepInMemories: false, tagIds: [], updatedAt: new Date().toISOString() };
  await saveComposeDraft(next, storage);
  await removeDurableMedia(draft.media, adapter);
  return next;
}

export async function cleanupOwnerDrafts(ownerId: string, storage: DraftStorage, adapter: DraftFileAdapter): Promise<number> {
  if (!isUuid(ownerId)) throw new Error('Invalid owner');
  return withOwnerLock(ownerId, async () => {
    const loaded = await loadComposeDraftsUnlocked(ownerId, storage, adapter);
    for (const draft of loaded.drafts) {
      await removeDurableMedia(draft.media, adapter);
      await storage.removeItem(composeDraftKey(ownerId, draft.kind, draft.draftId));
    }
    await storage.removeItem(composeDraftIndexKey(ownerId));
    await storage.removeItem(composeDraftPendingKey(ownerId));
    await adapter.deleteDirectoryIfExists(`${adapter.documentUri.replace(/\/+$/, '')}/compose-drafts/${ownerId}`);
    return loaded.drafts.length;
  });
}

function matchesMediaSignature(extension: string, mimeType: string, kind: 'photo' | 'video', bytes: Uint8Array): boolean {
  const ext = extension.toLowerCase();
  const imageMime = mimeType.toLowerCase();
  if (kind === 'photo' && !imageMime.startsWith('image/')) return false;
  if (kind === 'video' && !imageMime.startsWith('video/')) return false;
  if ((ext === 'jpg' || ext === 'jpeg') && imageMime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (ext === 'png' && imageMime === 'image/png') return bytes.slice(0, 8).every((b, i) => b === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][i]);
  if (ext === 'webp' && imageMime === 'image/webp') return textAt(bytes, 0, 'RIFF') && textAt(bytes, 8, 'WEBP');
  if (ext === 'heic' && (imageMime === 'image/heic' || imageMime === 'image/heif')) return textAt(bytes, 4, 'ftyp') && ['heic', 'heix', 'hevc', 'mif1'].some((brand) => textAt(bytes, 8, brand));
  if (ext === 'mp4' && imageMime === 'video/mp4') return textAt(bytes, 4, 'ftyp');
  if (ext === 'mov' && imageMime === 'video/quicktime') return textAt(bytes, 4, 'ftyp');
  if (ext === 'webm' && imageMime === 'video/webm') {
    return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  return false;
}
function textAt(bytes: Uint8Array, offset: number, value: string): boolean {
  return [...value].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
}
