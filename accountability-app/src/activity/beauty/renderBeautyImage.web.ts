import type { BeautySettings } from './types';

export const WEB_BEAUTY_RENDER_CAPABILITIES = Object.freeze({
  livePreview: false,
  finalRender: false,
  maxFaces: 0 as const,
});

export type WebBeautyRenderResult = Readonly<{
  sourceUri: string;
  uri: string;
  faceCount: 0;
  colorLookApplied: false;
  beautyMasksApplied: false;
  capabilities: typeof WEB_BEAUTY_RENDER_CAPABILITIES;
}>;

export async function renderBeautyImage(input: {
  sourceUri: string;
  settings: BeautySettings;
}): Promise<WebBeautyRenderResult> {
  return {
    sourceUri: input.sourceUri,
    uri: input.sourceUri,
    faceCount: 0,
    colorLookApplied: false,
    beautyMasksApplied: false,
    capabilities: WEB_BEAUTY_RENDER_CAPABILITIES,
  };
}

export default renderBeautyImage;
