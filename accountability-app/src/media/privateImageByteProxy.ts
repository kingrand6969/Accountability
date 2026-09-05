import { fetch as expoFetch } from 'expo/fetch';
import { File, FileMode } from 'expo-file-system';

export const PRIVATE_IMAGE_PROXY_TIMEOUT_MS = 15_000;

type PrivateImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
type FetchBytes = (url: string, init: RequestInit) => Promise<Response>;
type GetAccessToken = () => Promise<string | null>;
type RequestPrivateImage = (ref: string, signal: AbortSignal) => Promise<Response>;
type PartSink = { write(bytes: Uint8Array): void; close(): void };
type OpenPart = (destinationUri: string) => PartSink;

const IMAGE_REF = /^r2:\/\/(avatars|covers|post-images)\//;
const IMAGE_MIMES = new Set<PrivateImageMime>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function isPrivateImageRef(value: string | null | undefined): value is string {
  return typeof value === 'string' && IMAGE_REF.test(value);
}

function imageMimeForBytes(bytes: Uint8Array): PrivateImageMime | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  return null;
}

function fail(): never {
  throw new Error('Could not open this private image.');
}

export function createPrivateImageByteProxyRequest(
  fetchBytes: FetchBytes,
  getAccessToken: GetAccessToken,
  supabaseUrl: string,
  anonKey: string,
): RequestPrivateImage {
  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/media-read`;
  return async (ref, signal) => {
    const token = await getAccessToken().catch(() => null);
    if (!token || signal.aborted) fail();
    return fetchBytes(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref, delivery: 'bytes' }),
      signal,
    });
  };
}

function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Private image request ended.'));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new Error('Private image request ended.'));
    };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export function createPrivateImageByteProxyDownloader(
  request: RequestPrivateImage,
  openPart: OpenPart,
) {
  return async (
    ref: string,
    destinationUri: string,
    maxBytes: number,
    outerSignal: AbortSignal,
  ): Promise<void> => {
    if (!isPrivateImageRef(ref) || outerSignal.aborted) fail();
    const controller = new AbortController();
    const relayAbort = () => controller.abort();
    outerSignal.addEventListener('abort', relayAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), PRIVATE_IMAGE_PROXY_TIMEOUT_MS);
    let sink: PartSink | null = null;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let responseBody: ReadableStream<Uint8Array> | null = null;
    try {
      const response = await raceWithAbort(
        request(ref, controller.signal),
        controller.signal,
      ).catch(() => null);
      if (!response || controller.signal.aborted) fail();
      responseBody = response.body;
      if (response.status !== 200) fail();

      const transportMime = response.headers.get('content-type')
        ?.split(';', 1)[0].trim().toLowerCase();
      const declaredMime = response.headers.get('x-private-image-type')
        ?.split(';', 1)[0].trim().toLowerCase() as PrivateImageMime | undefined;
      if (
        transportMime !== 'application/octet-stream' ||
        !declaredMime ||
        !IMAGE_MIMES.has(declaredMime)
      ) fail();

      const lengthValue = response.headers.get('content-length');
      const declaredLength = lengthValue === null ? null : Number(lengthValue);
      if (
        declaredLength !== null &&
        (!Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > maxBytes)
      ) fail();
      if (!responseBody) fail();

      reader = responseBody.getReader();
      sink = openPart(destinationUri);
      const header = new Uint8Array(12);
      let headerBytes = 0;
      let totalBytes = 0;
      while (true) {
        const result = await raceWithAbort(
          reader.read(),
          controller.signal,
        ).catch(() => null);
        if (!result || controller.signal.aborted) fail();
        if (result.done) break;
        const chunk = result.value;
        totalBytes += chunk.byteLength;
        if (totalBytes > maxBytes) fail();
        if (headerBytes < header.byteLength) {
          const count = Math.min(header.byteLength - headerBytes, chunk.byteLength);
          header.set(chunk.subarray(0, count), headerBytes);
          headerBytes += count;
        }
        sink.write(chunk);
      }
      if (
        totalBytes < 1 ||
        (declaredLength !== null && totalBytes !== declaredLength) ||
        imageMimeForBytes(header) !== declaredMime ||
        controller.signal.aborted
      ) fail();
    } catch {
      controller.abort();
      if (reader) {
        await reader.cancel().catch(() => undefined);
      } else if (responseBody) {
        await responseBody.cancel().catch(() => undefined);
      }
      fail();
    } finally {
      clearTimeout(timeout);
      outerSignal.removeEventListener('abort', relayAbort);
      try {
        reader?.releaseLock();
      } catch {
        // The cache owns cleanup of a partial file after any transport failure.
      }
      try {
        sink?.close();
      } catch {
        // The cache owns cleanup of a partial file after any transport failure.
      }
    }
  };
}

const openPrivateImagePart: OpenPart = (destinationUri) => {
  const file = new File(destinationUri);
  file.create({ overwrite: false });
  const handle = file.open(FileMode.WriteOnly);
  return {
    write: (bytes) => handle.writeBytes(bytes),
    close: () => handle.close(),
  };
};

async function requestPrivateImage(ref: string, signal: AbortSignal): Promise<Response> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) fail();
  const { supabase } = await import('../lib/supabase');
  const request = createPrivateImageByteProxyRequest(
    expoFetch,
    async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    },
    supabaseUrl,
    anonKey,
  );
  return request(ref, signal);
}

export const downloadPrivateImageRef = createPrivateImageByteProxyDownloader(
  requestPrivateImage,
  openPrivateImagePart,
);
