import {
  chooseProgressPhoto,
  type CapturedProgressPhoto,
  type ProgressPhotoSource,
} from '../progress/photoCapture';

export async function captureComposerSelfie(input: {
  expectedOwner: string | null;
  expectedToken: number;
  currentOwner: () => string | null;
  currentToken: () => number;
  eventOpen: () => boolean;
  choosePhoto?: (source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>;
}): Promise<CapturedProgressPhoto | null> {
  const captured = await (input.choosePhoto ?? chooseProgressPhoto)('front-camera');
  if (!captured) return null;
  if (
    !input.expectedOwner
    || input.currentOwner() !== input.expectedOwner
    || input.currentToken() !== input.expectedToken
    || input.eventOpen()
  ) {
    await captured.release();
    return null;
  }
  return captured;
}
