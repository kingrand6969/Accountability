import type { ImagePickerAsset, ImagePickerErrorResult, ImagePickerResult } from 'expo-image-picker';

export type ExpectedPickedAsset = 'image' | 'video';

export type NormalizedPickedAsset =
  | { status: 'canceled' }
  | { status: 'invalid'; message: string }
  | { status: 'accepted'; asset: ImagePickerAsset };

type PickerResultLike =
  | ImagePickerResult
  | ImagePickerErrorResult
  | {
      canceled: false;
      assets: Partial<ImagePickerAsset>[];
    }
  | null;

const CANCELLATION_CODES = new Set([
  'E_PICKER_CANCELLED',
  'E_PICKER_CANCELED',
  'ERR_CANCELED',
  'E_CANCELED',
]);

export function normalizePickedAsset(
  result: PickerResultLike,
  expected: ExpectedPickedAsset,
): NormalizedPickedAsset {
  if (!result) {
    return { status: 'invalid', message: `No ${expected} was returned. Please try again.` };
  }
  if ('code' in result) {
    if (CANCELLATION_CODES.has(result.code.toUpperCase())) return { status: 'canceled' };
    return {
      status: 'invalid',
      message: `The ${expected} picker could not finish. Please try again.`,
    };
  }
  if (result.canceled) return { status: 'canceled' };

  const asset = result.assets[0];
  if (!asset) {
    return { status: 'invalid', message: `No ${expected} was returned. Please try again.` };
  }
  if (asset.type !== expected) {
    const article = expected === 'image' ? 'an' : 'a';
    return {
      status: 'invalid',
      message: `The selected file is not ${article} ${expected}. Please choose ${article} ${expected} and try again.`,
    };
  }
  if (typeof asset.uri !== 'string' || !asset.uri.trim()) {
    return {
      status: 'invalid',
      message: `The selected ${expected} could not be read. Please try again.`,
    };
  }

  return { status: 'accepted', asset: asset as ImagePickerAsset };
}

export type PickerRecoveryContext = {
  ownerId: string | null;
  draftId: string;
  mountToken: number;
  active: boolean;
};

type PickerRecoveryDependencies = {
  getPendingResult: () => Promise<unknown>;
  getContext: () => PickerRecoveryContext;
  attachPhoto: (asset: ImagePickerAsset, isCurrent: () => boolean) => Promise<void>;
  attachVideo: (asset: ImagePickerAsset, isCurrent: () => boolean) => Promise<void>;
  onInvalid: (message: string) => void;
};

function sameContext(left: PickerRecoveryContext, right: PickerRecoveryContext) {
  return left.active
    && right.active
    && left.ownerId === right.ownerId
    && left.draftId === right.draftId
    && left.mountToken === right.mountToken;
}

function assetFingerprint(asset: ImagePickerAsset) {
  return [
    asset.assetId ?? '',
    asset.uri.trim(),
    asset.type ?? '',
    asset.mimeType ?? '',
    asset.fileName ?? '',
    asset.fileSize ?? '',
    asset.duration ?? '',
  ].join('|');
}

export function createPickerRecoveryController(dependencies: PickerRecoveryDependencies) {
  const consumed = new Map<string, true>();
  let inFlight = false;
  let disposed = false;

  function trimConsumed() {
    while (consumed.size > 32) {
      const oldest = consumed.keys().next().value;
      if (typeof oldest !== 'string') break;
      consumed.delete(oldest);
    }
  }

  return {
    async recover() {
      const started = dependencies.getContext();
      if (disposed || inFlight || !started.active || !started.ownerId) return;
      inFlight = true;
      try {
        const pending = await dependencies.getPendingResult();
        const isCurrent = () => !disposed && sameContext(started, dependencies.getContext());
        if (!isCurrent() || !pending) return;
        const expected: ExpectedPickedAsset =
          typeof pending === 'object'
          && pending !== null
          && 'assets' in pending
          && Array.isArray(pending.assets)
          && pending.assets[0]?.type === 'video'
            ? 'video'
            : 'image';
        const normalized = normalizePickedAsset(pending as PickerResultLike, expected);
        if (normalized.status === 'canceled' || !isCurrent()) return;
        if (normalized.status === 'invalid') {
          dependencies.onInvalid(normalized.message);
          return;
        }
        const key = [
          started.ownerId,
          started.draftId,
          expected,
          assetFingerprint(normalized.asset),
        ].join(':');
        if (consumed.has(key)) return;
        try {
          if (expected === 'video') {
            await dependencies.attachVideo(normalized.asset, isCurrent);
          } else {
            await dependencies.attachPhoto(normalized.asset, isCurrent);
          }
          if (isCurrent()) {
            consumed.set(key, true);
            trimConsumed();
          }
        } catch {
          consumed.delete(key);
          if (isCurrent()) {
            dependencies.onInvalid(
              `The recovered ${expected} could not be saved. Please choose it again.`,
            );
          }
        }
      } catch {
        if (!disposed && sameContext(started, dependencies.getContext())) {
          dependencies.onInvalid('The media picker could not be checked. Please try again.');
        }
      } finally {
        inFlight = false;
      }
    },
    resetContext(ownerId: string | null, draftId: string) {
      const prefix = `${ownerId ?? ''}:${draftId}:`;
      for (const key of consumed.keys()) {
        if (!key.startsWith(prefix)) consumed.delete(key);
      }
    },
    dispose() {
      disposed = true;
      consumed.clear();
    },
  };
}
