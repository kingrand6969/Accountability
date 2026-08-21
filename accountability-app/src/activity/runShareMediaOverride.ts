import type { RunMediaCacheItem } from './runMediaCache';

export type RunSharePresentation = Readonly<{
  mode: 'map' | 'photo';
  photoUri: string | null;
  photoKind: 'selfie' | 'place' | 'gallery' | null;
  originalRatio: number | null;
}>;

export type RunShareStudioPhotoDraft = Readonly<{
  operationId: string;
  uri: string;
  source: 'selfie' | 'gallery';
  width: number;
  height: number;
}>;

type StagedOverride = Readonly<{
  operationId: string;
  previousPresentation: RunSharePresentation;
  previousProcessedPhoto: RunMediaCacheItem | null;
  presentation: RunSharePresentation;
}>;

export function createRunShareMediaOverrideController() {
  let staged: StagedOverride | null = null;

  return {
    stage(
      previousPresentation: RunSharePresentation,
      previousProcessedPhoto: RunMediaCacheItem | null,
      draft: RunShareStudioPhotoDraft,
    ): RunSharePresentation {
      if (staged) {
        if (staged.operationId !== draft.operationId) {
          throw new Error('Another Run Share Studio draft is already staged.');
        }
        return staged.presentation;
      }
      const presentation: RunSharePresentation = {
        mode: 'photo',
        photoUri: draft.uri,
        photoKind: draft.source,
        originalRatio: draft.width / draft.height,
      };
      staged = {
        operationId: draft.operationId,
        previousPresentation,
        previousProcessedPhoto,
        presentation,
      };
      return presentation;
    },
    cancel(): Readonly<{
      presentation: RunSharePresentation;
      processedPhoto: RunMediaCacheItem | null;
    }> | null {
      if (!staged) return null;
      const result = {
        presentation: staged.previousPresentation,
        processedPhoto: staged.previousProcessedPhoto,
      };
      staged = null;
      return result;
    },
    commit(): Readonly<{
      presentation: RunSharePresentation;
      releasePrevious: RunMediaCacheItem | null;
    }> | null {
      if (!staged) return null;
      const result = {
        presentation: staged.presentation,
        releasePrevious: staged.previousProcessedPhoto,
      };
      staged = null;
      return result;
    },
    clear(): void {
      staged = null;
    },
  };
}

export type RunFeedImageUploadDependencies = Readonly<{
  readBase64(uri: string): Promise<string>;
  uploadPostImage(
    base64: string,
    ext: string,
    operationId: string | undefined,
    expectedOwnerId: string,
  ): Promise<string>;
  assertOwned(): void;
}>;

export async function uploadRunFeedImage(
  input: Readonly<{
    uri: string;
    operationId: string | undefined;
    expectedOwnerId: string;
  }>,
  dependencies: RunFeedImageUploadDependencies,
): Promise<string> {
  dependencies.assertOwned();
  const base64 = await dependencies.readBase64(input.uri);
  dependencies.assertOwned();
  const imageUrl = await dependencies.uploadPostImage(
    base64,
    'jpg',
    input.operationId,
    input.expectedOwnerId,
  );
  dependencies.assertOwned();
  return imageUrl;
}
