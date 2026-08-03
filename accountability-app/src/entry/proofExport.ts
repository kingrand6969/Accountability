import { sanitizeProofParam } from './proofPrivacy';

const renderAssetBrand = Symbol('proof-render-asset');

export type RenderAssetHandle = object;

type ManagedBitmap = {
  brand: typeof renderAssetBrand;
  ownerId: string;
  uri: string;
  storeId: object;
  live: boolean;
};

const managedBitmaps = new WeakMap<RenderAssetHandle, ManagedBitmap>();

export type ProofFormat = 'portrait' | 'square' | 'landscape';

export type ProofExportInput = Readonly<{
  brand?: unknown;
  headline?: unknown;
  format?: unknown;
  metrics?: Readonly<Record<string, unknown>>;
  locationLabel?: unknown;
  routeImage?: unknown;
  amountDisplay?: unknown;
  buddyDisplayNames?: unknown;
  buddyPortraitImages?: unknown;
}>;

export type ProofExportOptIns = Readonly<{
  location?: unknown;
  route?: unknown;
  amount?: unknown;
  buddyNames?: unknown;
  buddyPortraits?: unknown;
}>;

export type ProofExport = Readonly<{
  brand: string;
  headline: string;
  format: ProofFormat;
  metrics: Readonly<{
    workouts: number;
    activities: number;
    streakDays: number;
  }>;
  locationLabel?: string;
  routeImage?: RenderAssetHandle;
  amountDisplay?: string;
  buddyDisplayNames?: readonly string[];
  buddyPortraitImages?: readonly RenderAssetHandle[];
}>;

type Builder = (input: ProofExportInput, optIns: ProofExportOptIns) => ProofExport;

export const buildFeedProofExport: Builder = buildProofExport;
export const buildExternalProofExport: Builder = buildProofExport;
export const buildPhoneProofExport: Builder = buildProofExport;
export const buildMemoryProofExport: Builder = buildProofExport;

function buildProofExport(input: ProofExportInput, optIns: ProofExportOptIns): ProofExport {
  const output: {
    brand: string;
    headline: string;
    format: ProofFormat;
    metrics: { workouts: number; activities: number; streakDays: number };
    locationLabel?: string;
    routeImage?: RenderAssetHandle;
    amountDisplay?: string;
    buddyDisplayNames?: string[];
    buddyPortraitImages?: RenderAssetHandle[];
  } = {
    brand: safeRequiredText(input.brand),
    headline: safeRequiredText(input.headline),
    format: safeFormat(input.format),
    metrics: safeMetrics(input.metrics),
  };

  if (optIns.location === true) {
    const value = safeOptionalText(input.locationLabel);
    if (value !== undefined) output.locationLabel = value;
  }
  if (optIns.route === true && isAuthenticHandle(input.routeImage)) {
    output.routeImage = input.routeImage;
  }
  if (optIns.amount === true) {
    const value = safeOptionalText(input.amountDisplay);
    if (value !== undefined) output.amountDisplay = value;
  }
  if (optIns.buddyNames === true) {
    const value = safeTextArray(input.buddyDisplayNames);
    if (value !== undefined) output.buddyDisplayNames = value;
  }
  if (optIns.buddyPortraits === true && Array.isArray(input.buddyPortraitImages)) {
    const handles = input.buddyPortraitImages.filter(isAuthenticHandle);
    if (handles.length > 0) output.buddyPortraitImages = handles;
  }
  return output;
}

function safeRequiredText(value: unknown): string {
  return safeOptionalText(value) ?? '';
}

function safeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return sanitizeProofParam(value, 160) ?? undefined;
}

function safeFormat(value: unknown): ProofFormat {
  return value === 'square' || value === 'landscape' ? value : 'portrait';
}

function safeMetric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function safeMetrics(value: unknown): ProofExport['metrics'] {
  const metrics =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Readonly<Record<string, unknown>>)
      : {};
  return {
    workouts: safeMetric(metrics.workouts),
    activities: safeMetric(metrics.activities),
    streakDays: safeMetric(metrics.streakDays),
  };
}

function safeTextArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value
    .map((item) => (typeof item === 'string' ? sanitizeProofParam(item, 80) : null))
    .filter((item): item is string => item !== null);
  return result.length > 0 ? result : undefined;
}

function isAuthenticHandle(value: unknown): value is RenderAssetHandle {
  if (value === null || typeof value !== 'object') return false;
  const bitmap = managedBitmaps.get(value);
  return bitmap?.brand === renderAssetBrand && bitmap.live;
}

export type StagedRenderAsset = Readonly<{
  tempUri: string;
  finalUri: string;
  canonicalFinalUri: string;
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
  decoded: boolean;
  symlinkFree: boolean;
  redirectHosts?: readonly string[];
}>;

export type RenderAssetAdapter = Readonly<{
  managedRoot: string;
  stageLocal(source: string): Promise<StagedRenderAsset>;
  stageRemote(source: string, approvedHosts: readonly string[]): Promise<StagedRenderAsset>;
  atomicMove(tempUri: string, finalUri: string): Promise<void>;
  delete(uri: string): Promise<void>;
}>;

export type RenderAssetSource =
  | Readonly<{ kind: 'local'; reference: string }>
  | Readonly<{ kind: 'remote'; url: string }>;

export type RenderAssetStore = Readonly<{
  create(ownerId: string, source: RenderAssetSource): Promise<RenderAssetHandle>;
  resolveForCapture(ownerId: string, handles: readonly RenderAssetHandle[]): readonly string[];
  revoke(handle: RenderAssetHandle): Promise<void>;
  revokeOwner(ownerId: string): Promise<void>;
  dispose(): Promise<void>;
}>;

export function createProofRenderAssetStore(
  adapter: RenderAssetAdapter,
  policy: Readonly<{
    approvedRemoteHosts: readonly string[];
    maxBytes: number;
    maxPixels: number;
  }>,
): RenderAssetStore {
  const storeId = {};
  const liveHandles = new Set<RenderAssetHandle>();
  const approvedHosts = new Set(policy.approvedRemoteHosts.map(normalizeHost));

  async function create(ownerId: string, source: RenderAssetSource): Promise<RenderAssetHandle> {
    if (!ownerId) throwUnavailable();
    let staged: StagedRenderAsset | undefined;
    try {
      if (source.kind === 'remote') {
        validateRemoteSource(source.url, approvedHosts);
        staged = await adapter.stageRemote(source.url, [...approvedHosts]);
      } else {
        if (
          !source.reference ||
          !/^(?:file|content):\/\//iu.test(source.reference) ||
          /(?:supabase|cloudflarestorage|storage\/v1|x-amz-|[?&](?:token|signature|sig|expires|key|credential)=)/iu.test(
            source.reference,
          )
        ) {
          throwUnavailable();
        }
        staged = await adapter.stageLocal(source.reference);
      }
      validateStaged(staged, adapter.managedRoot, approvedHosts, policy);
      await adapter.atomicMove(staged.tempUri, staged.finalUri);

      const target = Object.freeze(Object.create(null) as object);
      const handle = new Proxy(target, {
        get(_target, property) {
          if (property === 'toJSON' || property === Symbol.toPrimitive) {
            return () => {
              throw new Error('Render asset is opaque');
            };
          }
          return undefined;
        },
      });
      Object.freeze(handle);
      managedBitmaps.set(handle, {
        brand: renderAssetBrand,
        ownerId,
        uri: staged.finalUri,
        storeId,
        live: true,
      });
      liveHandles.add(handle);
      return handle;
    } catch {
      if (staged) {
        await Promise.allSettled([adapter.delete(staged.tempUri), adapter.delete(staged.finalUri)]);
      }
      throw new Error('Render asset unavailable');
    }
  }

  function resolveForCapture(
    ownerId: string,
    handles: readonly RenderAssetHandle[],
  ): readonly string[] {
    return handles.map((handle) => {
      const bitmap = managedBitmaps.get(handle);
      if (
        !bitmap ||
        bitmap.brand !== renderAssetBrand ||
        !bitmap.live ||
        bitmap.ownerId !== ownerId ||
        bitmap.storeId !== storeId
      ) {
        throwUnavailable();
      }
      return bitmap.uri;
    });
  }

  async function revoke(handle: RenderAssetHandle): Promise<void> {
    const bitmap = managedBitmaps.get(handle);
    if (!bitmap || bitmap.storeId !== storeId || !bitmap.live) return;
    bitmap.live = false;
    liveHandles.delete(handle);
    await adapter.delete(bitmap.uri).catch(() => undefined);
  }

  async function revokeOwner(ownerId: string): Promise<void> {
    await Promise.all(
      [...liveHandles].map(async (handle) => {
        if (managedBitmaps.get(handle)?.ownerId === ownerId) await revoke(handle);
      }),
    );
  }

  async function dispose(): Promise<void> {
    await Promise.all([...liveHandles].map(revoke));
  }

  return { create, resolveForCapture, revoke, revokeOwner, dispose };
}

function validateRemoteSource(urlValue: string, approvedHosts: ReadonlySet<string>): void {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throwUnavailable();
  }
  if (
    url.protocol !== 'https:' ||
    !approvedHosts.has(normalizeHost(url.hostname)) ||
    hasPrivateUrlSignal(urlValue)
  ) {
    throwUnavailable();
  }
}

function hasPrivateUrlSignal(value: string): boolean {
  let inspected = value;
  for (let index = 0; index < 6; index += 1) {
    try {
      const decoded = decodeURIComponent(inspected);
      if (decoded === inspected) break;
      inspected = decoded;
    } catch {
      return true;
    }
  }
  return /(?:supabase|cloudflarestorage|storage\/v1|r2:|file:|content:|x-amz-|[?&](?:token|signature|sig|expires|key|credential)=)/iu.test(
    inspected,
  );
}

function validateStaged(
  staged: StagedRenderAsset,
  managedRoot: string,
  approvedHosts: ReadonlySet<string>,
  policy: Readonly<{ maxBytes: number; maxPixels: number }>,
): void {
  const canonicalRoot = ensureTrailingSlash(managedRoot);
  if (
    !['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(
      staged.mimeType.toLowerCase(),
    ) ||
    !Number.isFinite(staged.byteLength) ||
    staged.byteLength < 1 ||
    staged.byteLength > policy.maxBytes ||
    !Number.isFinite(staged.width) ||
    !Number.isFinite(staged.height) ||
    staged.width < 1 ||
    staged.height < 1 ||
    staged.width * staged.height > policy.maxPixels ||
    !staged.decoded ||
    !staged.symlinkFree ||
    !staged.tempUri.startsWith(canonicalRoot) ||
    !staged.finalUri.startsWith(canonicalRoot) ||
    !staged.canonicalFinalUri.startsWith(canonicalRoot) ||
    (staged.redirectHosts ?? []).some((host) => !approvedHosts.has(normalizeHost(host)))
  ) {
    throwUnavailable();
  }
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/u, '');
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function throwUnavailable(): never {
  throw new Error('Render asset unavailable');
}
