import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Resize + compress a picked photo before uploading it.
 *
 * Phones shoot ~12 MP images; an avatar is shown in a ~48 px circle and a cover
 * in a thin banner. Uploading the full-resolution original wastes storage AND
 * re-serves those megabytes on every view. Downscaling to the largest size the
 * app ever displays cuts both — with no visible change (the result is still far
 * larger than any on-screen size). Mirrors what Memories already does.
 *
 * @param uri       local file uri of the picked image
 * @param maxWidth  target width in px (height scales to keep aspect ratio)
 * @param compress  JPEG quality 0–1 (default 0.72 — visually lossless at these sizes)
 * @returns         base64 of the resized JPEG (upload as ext 'jpg')
 */
export async function prepareUpload(
  uri: string,
  maxWidth: number,
  compress = 0.72,
): Promise<string> {
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!out.base64) throw new Error('Could not process that image.');
  return out.base64;
}
