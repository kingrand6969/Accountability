import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  addMeasurement,
  deleteProgressPhoto,
  inspectProgressImageUri,
  listMeasurements,
  listProgressPhotos,
  readProgressImageUri,
  saveProgressPhoto,
  type ProgressApiDependencies,
} from './api';
import { calculateBmi } from './bmi';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER_OWNER = '22222222-2222-4222-8222-222222222222';
const OPERATION = '33333333-3333-4333-8333-333333333333';
const OTHER_OPERATION = '44444444-4444-4444-8444-444444444444';
const ALPHA_OPERATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NON_V4_OPERATIONS = [
  'aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-3aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa',
] as const;
const MAX_PROGRESS_IMAGE_BYTES = 20 * 1024 * 1024;
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;

test('inspects a web blob without materializing bytes, then reads valid bytes exactly once', async () => {
  const blob = new Blob([JPEG_BYTES], { type: 'image/jpeg' });
  const arrayBuffer = jest.spyOn(blob, 'arrayBuffer').mockResolvedValue(JPEG_BYTES);
  const fetcher: typeof fetch = async () => ({ ok: true, blob: async () => blob } as globalThis.Response);
  await expect(inspectProgressImageUri('blob:https://app.example/photo', fetcher)).resolves.toEqual({
    size: JPEG_BYTES.byteLength,
    mimeType: 'image/jpeg',
  });
  expect(arrayBuffer).not.toHaveBeenCalled();
  await expect(readProgressImageUri('blob:https://app.example/photo', fetcher)).resolves.toBe(JPEG_BYTES);
  expect(arrayBuffer).toHaveBeenCalledTimes(1);
});

type Response = { data: unknown; error: unknown; status?: number };
type AuthResponse = { owner: string | null; error?: unknown };

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function fixture(options: {
  owners?: (string | null)[];
  authResponses?: AuthResponse[];
  listMeasurements?: Response;
  insertedMeasurement?: Response;
  listPhotos?: Response;
  existingPhoto?: Response;
  insertedPhoto?: Response;
  confirmedPhoto?: Response;
  deletedPhoto?: Response;
  upload?: Response | Promise<Response>;
  remove?: Response | Promise<Response>;
  removeResponses?: ({ result: Response } | { throws: unknown })[];
  uploadResponses?: (Response | Promise<Response>)[];
  photoResponses?: Response[];
  imageSize?: number;
  imageMimeType?: string;
  imageBytes?: ArrayBuffer;
} = {}) {
  const events: string[] = [];
  const authResponses: AuthResponse[] = [
    ...(options.authResponses ?? (options.owners ?? [OWNER]).map((owner) => ({ owner }))),
  ];
  let lastAuth: AuthResponse = authResponses[authResponses.length - 1] ?? { owner: null };
  const getUser = jest.fn(async () => {
    if (authResponses.length > 0) lastAuth = authResponses.shift() ?? { owner: null };
    events.push(`auth:${lastAuth.owner ?? 'signed-out'}`);
    return {
      data: { user: lastAuth.owner ? { id: lastAuth.owner } : null },
      error: lastAuth.error ?? null,
    };
  });
  const uploadResponses = [...(options.uploadResponses ?? [])];
  const upload = jest.fn(async () => {
    events.push('upload');
    return await (uploadResponses.shift() ?? options.upload ?? { data: null, error: null });
  });
  const remove = jest.fn(async () => {
    events.push('remove');
    const scripted = options.removeResponses?.shift();
    if (scripted && 'throws' in scripted) throw scripted.throws;
    if (scripted) return scripted.result;
    return await (options.remove ?? { data: null, error: null });
  });

  const measurementList = options.listMeasurements ?? { data: [], error: null };
  const photoList = options.listPhotos ?? { data: [], error: null };
  const measurementInsert = options.insertedMeasurement ?? { data: null, error: null };
  const photoExisting = options.existingPhoto ?? { data: null, error: null };
  const photoInsert = options.insertedPhoto ?? { data: null, error: null };
  const photoDelete = options.deletedPhoto ?? { data: null, error: null };
  const photoResponses = [...(options.photoResponses ?? [])];

  const calls = {
    selects: [] as string[],
    equals: [] as [string, unknown][],
    orders: [] as [string, { ascending: boolean }][],
    limits: [] as number[],
    inserts: [] as unknown[],
    deletes: 0,
  };

  function orderedList(response: Response) {
    const terminal = {
      then: (resolve: (value: Response) => unknown) => Promise.resolve(response).then(resolve),
    };
    const chain: any = {
      select: jest.fn((columns: string) => {
        calls.selects.push(columns);
        return chain;
      }),
      eq: jest.fn((column: string, value: unknown) => {
        calls.equals.push([column, value]);
        return chain;
      }),
      order: jest.fn((column: string, direction: { ascending: boolean }) => {
        calls.orders.push([column, direction]);
        return chain;
      }),
      limit: jest.fn((limit: number) => {
        calls.limits.push(limit);
        return terminal;
      }),
      then: terminal.then,
    };
    return chain;
  }

  function singleWrite(response: Response, operation: 'insert' | 'delete') {
    const chain: any = {
      insert: jest.fn((value: unknown) => {
        events.push('insert');
        calls.inserts.push(value);
        return chain;
      }),
      delete: jest.fn(() => {
        events.push('delete-row');
        calls.deletes += 1;
        return chain;
      }),
      select: jest.fn((columns: string) => {
        calls.selects.push(columns);
        return chain;
      }),
      eq: jest.fn((column: string, value: unknown) => {
        calls.equals.push([column, value]);
        return chain;
      }),
      single: jest.fn(async () => response),
      maybeSingle: jest.fn(async () => response),
    };
    return operation === 'insert' ? chain : chain;
  }

  let photoCalls = 0;
  const from = jest.fn((table: string) => {
    if (table === 'body_measurements') {
      if (options.insertedMeasurement !== undefined) {
        return singleWrite(measurementInsert, 'insert');
      }
      return orderedList(measurementList);
    }
    if (table === 'progress_photos') {
      if (options.photoResponses !== undefined) {
        return singleWrite(
          photoResponses.shift() ?? { data: null, error: null },
          'delete',
        );
      }
      if (options.deletedPhoto !== undefined) return singleWrite(photoDelete, 'delete');
      if (options.insertedPhoto !== undefined) {
        const call = photoCalls;
        photoCalls += 1;
        if (call === 0) return singleWrite(photoExisting, 'delete');
        if (call === 1) return singleWrite(photoInsert, 'insert');
        return singleWrite(
          options.confirmedPhoto ?? { data: null, error: null },
          'delete',
        );
      }
      if (options.existingPhoto !== undefined) {
        return singleWrite(photoExisting, 'delete');
      }
      return orderedList(photoList);
    }
    throw new Error(`Unexpected table ${table}`);
  });

  const deps: ProgressApiDependencies = {
    client: {
      auth: { getUser },
      from,
      storage: { from: jest.fn(() => ({ upload, remove })) },
    },
    inspectLocalImage: jest.fn(async () => {
      events.push('inspect-file');
      return {
        size: options.imageSize ?? (options.imageBytes ?? JPEG_BYTES).byteLength,
        mimeType: options.imageMimeType ?? 'image/jpeg',
      };
    }),
    readLocalImage: jest.fn(async () => {
      events.push('read-file');
      return options.imageBytes ?? JPEG_BYTES;
    }),
    randomUUID: jest.fn(() => OPERATION),
  };

  return { deps, calls, events, getUser, upload, remove, from };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('measurement APIs', () => {
  test.each([null, OTHER_OWNER])('rejects signed-out or changed accounts before querying (%s)', async (owner) => {
    const f = fixture({ owners: [owner] });
    const expected = owner === null ? 'Not signed in.' : 'Account changed.';

    await expect(listMeasurements(OWNER, 52, f.deps)).rejects.toThrow(expected);
    expect(f.from).not.toHaveBeenCalled();
  });

  test('selects only owner-bound fields, orders deterministically, caps the limit, and maps numerics', async () => {
    const f = fixture({
      listMeasurements: {
        data: [{ id: 'm1', user_id: OWNER, recorded_at: '2026-08-20T10:00:00.000Z', weight_kg: '70.25', height_cm: 175 }],
        error: null,
      },
    });

    await expect(listMeasurements(OWNER, 999, f.deps)).resolves.toEqual([
      { id: 'm1', recordedAt: '2026-08-20T10:00:00.000Z', weightKg: 70.25, heightCm: 175 },
    ]);
    expect(f.calls.selects).toContain('id,user_id,recorded_at,weight_kg,height_cm');
    expect(f.calls.equals).toContainEqual(['user_id', OWNER]);
    expect(f.calls.orders).toEqual([
      ['recorded_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(f.calls.limits).toEqual([104]);
  });

  test('defaults and normalizes measurement limits to safe integers', async () => {
    const defaults = fixture();
    await listMeasurements(OWNER, undefined, defaults.deps);
    expect(defaults.calls.limits).toEqual([52]);

    const low = fixture();
    await listMeasurements(OWNER, -4.7, low.deps);
    expect(low.calls.limits).toEqual([1]);
  });

  test('fails closed when a measurement row is malformed or belongs to another owner', async () => {
    const malformed = fixture({
      listMeasurements: {
        data: [{ id: 'm1', user_id: OTHER_OWNER, recorded_at: 'not-a-date', weight_kg: 'NaN', height_cm: 175 }],
        error: null,
      },
    });

    await expect(listMeasurements(OWNER, 52, malformed.deps)).rejects.toThrow(
      'Progress data could not be verified.',
    );
  });

  test('account change wins over a read error that completes for the previous owner', async () => {
    const queryError = new Error('query failed');
    const f = fixture({
      owners: [OWNER, OTHER_OWNER],
      listMeasurements: { data: null, error: queryError },
    });

    await expect(listMeasurements(OWNER, 52, f.deps)).rejects.toThrow(
      'Account changed.',
    );
  });

  test('validates with BMI bounds, inserts the expected owner, and returns the confirmed row', async () => {
    const invalid = fixture({ insertedMeasurement: { data: null, error: null } });
    await expect(addMeasurement({ recordedAt: '2026-08-20T10:00:00.000Z', weightKg: 19, heightCm: 175 }, OWNER, invalid.deps)).rejects.toThrow(
      'Enter valid weight and height values.',
    );
    expect(invalid.from).not.toHaveBeenCalled();

    const f = fixture({
      insertedMeasurement: {
        data: { id: 'm2', user_id: OWNER, recorded_at: '2026-08-20T10:00:00.000Z', weight_kg: '80', height_cm: '180' },
        error: null,
      },
    });
    await expect(addMeasurement({ recordedAt: '2026-08-20T10:00:00.000Z', weightKg: 80, heightCm: 180 }, OWNER, f.deps)).resolves.toEqual(
      { id: 'm2', recordedAt: '2026-08-20T10:00:00.000Z', weightKg: 80, heightCm: 180 },
    );
    expect(f.calls.inserts).toEqual([{ user_id: OWNER, recorded_at: '2026-08-20T10:00:00.000Z', weight_kg: 80, height_cm: 180 }]);
    expect(f.calls.selects).toContain('id,user_id,recorded_at,weight_kg,height_cm');
  });

  test('canonicalizes measurement precision to two decimals before insert and return', async () => {
    const input = { recordedAt: '2026-08-20T10:00:00Z', weightKg: 81.555, heightCm: 175.555 } as const;
    const f = fixture({
      insertedMeasurement: {
        data: { id: 'm3', user_id: OWNER, recorded_at: '2026-08-20T10:00:00.000Z', weight_kg: '81.56', height_cm: '175.56' },
        error: null,
      },
    });

    const added = await addMeasurement(input, OWNER, f.deps);
    expect(added).toEqual({
      id: 'm3', recordedAt: '2026-08-20T10:00:00.000Z', weightKg: 81.56, heightCm: 175.56,
    });
    expect(f.calls.inserts).toEqual([{ user_id: OWNER, recorded_at: '2026-08-20T10:00:00.000Z', weight_kg: 81.56, height_cm: 175.56 }]);
    expect(calculateBmi(input.weightKg, input.heightCm)).toBe(
      calculateBmi(added.weightKg, added.heightCm),
    );
  });

  test.each([
    '2026-08-20T10:00:00',
    '2026-02-31T10:00:00Z',
    '2025-02-29T10:00:00Z',
  ])('rejects non-RFC3339 or impossible measurement timestamp %s', async (recordedAt) => {
    const f = fixture({ insertedMeasurement: { data: null, error: null } });
    await expect(addMeasurement({ recordedAt, weightKg: 80, heightCm: 180 }, OWNER, f.deps)).rejects.toThrow(
      'Progress data could not be verified.',
    );
    expect(f.from).not.toHaveBeenCalled();
  });

  test.each([
    ['2024-02-29T23:59:59Z', '2024-02-29T23:59:59.000Z'],
    ['2026-08-20T18:00:00+08:00', '2026-08-20T10:00:00.000Z'],
  ])('accepts and normalizes strict RFC3339 timestamp %s', async (recordedAt, normalized) => {
    const f = fixture({
      insertedMeasurement: {
        data: { id: 'm4', user_id: OWNER, recorded_at: normalized, weight_kg: '80', height_cm: '180' },
        error: null,
      },
    });
    await addMeasurement({ recordedAt, weightKg: 80, heightCm: 180 }, OWNER, f.deps);
    expect(f.calls.inserts).toContainEqual({ user_id: OWNER, recorded_at: normalized, weight_kg: 80, height_cm: 180 });
  });
});

describe('progress photo APIs', () => {
  test('lists owner-bound photos in deterministic order and maps nullable numeric weight', async () => {
    const f = fixture({
      listPhotos: { data: [{ id: 'p1', user_id: OWNER, storage_path: `${OWNER}/${OPERATION}.jpg`, captured_at: '2026-08-21T10:00:00.000Z', weight_kg: null }], error: null },
    });
    await expect(listProgressPhotos(OWNER, f.deps)).resolves.toEqual([
      { id: 'p1', storagePath: `${OWNER}/${OPERATION}.jpg`, capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null },
    ]);
    expect(f.calls.selects).toContain('id,user_id,storage_path,captured_at,weight_kg');
    expect(f.calls.equals).toContainEqual(['user_id', OWNER]);
    expect(f.calls.orders).toEqual([
      ['captured_at', { ascending: false }],
      ['id', { ascending: false }],
      ['captured_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
    expect(f.calls.limits).toEqual([1, 1]);
  });

  test('fails closed when a stored photo path is not canonical', async () => {
    const f = fixture({
      listPhotos: {
        data: [{ id: 'p1', user_id: OWNER, storage_path: `${OWNER}/${OPERATION}.png`, captured_at: '2026-08-21T10:00:00.000Z', weight_kg: null }],
        error: null,
      },
    });

    await expect(listProgressPhotos(OWNER, f.deps)).rejects.toThrow(
      'Progress data could not be verified.',
    );
  });

  test('uploads a local image to an opaque owner path before inserting its row', async () => {
    const f = fixture({
      owners: [OWNER, OWNER, OWNER],
      existingPhoto: { data: null, error: null },
      insertedPhoto: { data: { id: 'p2', user_id: OWNER, storage_path: `${OWNER}/${OPERATION}.jpg`, captured_at: '2026-08-21T10:00:00.000Z', weight_kg: '81.56' }, error: null },
    });
    await expect(saveProgressPhoto({ localUri: 'file:///private/DCIM/my-name.jpg', capturedAt: '2026-08-21T10:00:00.000Z', weightKg: 81.555 }, OWNER, OPERATION, f.deps)).resolves.toMatchObject({ id: 'p2', storagePath: `${OWNER}/${OPERATION}.jpg`, weightKg: 81.56 });
    expect(f.events.indexOf('upload')).toBeLessThan(f.events.indexOf('insert'));
    expect(f.upload).toHaveBeenCalledWith(
      `${OWNER}/${OPERATION}.jpg`,
      expect.any(ArrayBuffer),
      { contentType: 'image/jpeg', upsert: false },
    );
    expect(f.calls.inserts).toContainEqual({ user_id: OWNER, storage_path: `${OWNER}/${OPERATION}.jpg`, captured_at: '2026-08-21T10:00:00.000Z', weight_kg: 81.56 });
    expect(f.deps.inspectLocalImage).toHaveBeenCalledTimes(1);
    expect(f.deps.readLocalImage).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['empty image', { imageSize: 0, imageBytes: new ArrayBuffer(0) }],
    ['oversized stat', { imageSize: MAX_PROGRESS_IMAGE_BYTES + 1, imageBytes: JPEG_BYTES }],
  ])('rejects %s before reading image bytes', async (_label, image) => {
    const f = fixture({ ...image, existingPhoto: { data: null, error: null } });

    await expect(saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00Z', weightKg: null }, OWNER, OPERATION, f.deps)).rejects.toThrow(
      'Choose a valid JPEG or PNG image up to 20 MB.',
    );
    expect(f.deps.readLocalImage).not.toHaveBeenCalled();
    expect(f.upload).not.toHaveBeenCalled();
  });

  test('rejects bytes over 20 MiB even when the initial stat was safe', async () => {
    const f = fixture({
      imageSize: JPEG_BYTES.byteLength,
      imageBytes: new ArrayBuffer(MAX_PROGRESS_IMAGE_BYTES + 1),
      existingPhoto: { data: null, error: null },
    });
    await expect(saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00Z', weightKg: null }, OWNER, OPERATION, f.deps)).rejects.toThrow(
      'Choose a valid JPEG or PNG image up to 20 MB.',
    );
    expect(f.upload).not.toHaveBeenCalled();
  });

  test.each([
    ['bad magic', new Uint8Array([1, 2, 3, 4]).buffer, 'image/jpeg'],
    ['video MIME', JPEG_BYTES, 'video/mp4'],
    ['MIME and magic mismatch', PNG_BYTES, 'image/jpeg'],
  ])('rejects %s image content', async (_label, imageBytes, imageMimeType) => {
    const f = fixture({ imageBytes, imageMimeType, existingPhoto: { data: null, error: null } });
    await expect(saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00Z', weightKg: null }, OWNER, OPERATION, f.deps)).rejects.toThrow(
      'Choose a valid JPEG or PNG image up to 20 MB.',
    );
    expect(f.upload).not.toHaveBeenCalled();
  });

  test('accepts actual PNG bytes with matching MIME', async () => {
    const row = { id: 'p-png', user_id: OWNER, storage_path: `${OWNER}/${OPERATION}.jpg`, captured_at: '2026-08-21T10:00:00.000Z', weight_kg: null };
    const f = fixture({
      imageBytes: PNG_BYTES,
      imageMimeType: 'image/png',
      existingPhoto: { data: null, error: null },
      insertedPhoto: { data: row, error: null },
    });

    await saveProgressPhoto({ localUri: 'file:///photo.png', capturedAt: row.captured_at, weightKg: null }, OWNER, OPERATION, f.deps);
    expect(f.upload).toHaveBeenCalledWith(row.storage_path, PNG_BYTES, {
      contentType: 'image/png', upsert: false,
    });
  });

  test.each(NON_V4_OPERATIONS)(
    'rejects non-v4 operation id %s before reading or writing',
    async (operationId) => {
      const f = fixture();

      await expect(saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null }, OWNER, operationId, f.deps)).rejects.toThrow(
        'Progress photo could not be verified.',
      );
      expect(f.deps.readLocalImage).not.toHaveBeenCalled();
      expect(f.from).not.toHaveBeenCalled();
      expect(f.upload).not.toHaveBeenCalled();
    },
  );

  test('does not insert or clean up under a different account after upload completes', async () => {
    const upload = deferred<Response>();
    const f = fixture({ owners: [OWNER, OWNER, OWNER, OTHER_OWNER], existingPhoto: { data: null, error: null }, upload: upload.promise });
    const saving = saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null }, OWNER, OPERATION, f.deps);
    await Promise.resolve();
    await Promise.resolve();
    upload.resolve({ data: null, error: null });

    await expect(saving).rejects.toThrow('Account changed.');
    expect(f.calls.inserts).toEqual([]);
    expect(f.remove).not.toHaveBeenCalled();
  });

  test('account change wins when upload fails after the active account switches', async () => {
    const uploadError = new Error('upload failed');
    const f = fixture({
      owners: [OWNER, OWNER, OWNER, OTHER_OWNER],
      existingPhoto: { data: null, error: null },
      upload: { data: null, error: uploadError },
    });

    await expect(saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null }, OWNER, OPERATION, f.deps)).rejects.toThrow(
      'Account changed.',
    );
  });

  test('never treats an unrelated upload conflict as an existing operation object', async () => {
    const uploadError = { statusCode: '409', message: 'Bucket quota conflict' };
    const f = fixture({
      existingPhoto: { data: null, error: null },
      upload: { data: null, error: uploadError },
    });

    await expect(saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null }, OWNER, OPERATION, f.deps)).rejects.toBe(uploadError);
    expect(f.calls.inserts).toEqual([]);
  });

  test('removes only its own object when insert definitely failed and confirmation proves no row', async () => {
    const insertError = Object.assign(new Error('constraint failure'), {
      code: '23514',
      status: 400,
    });
    const f = fixture({
      owners: [OWNER, OWNER, OWNER],
      existingPhoto: { data: null, error: null },
      insertedPhoto: { data: null, error: insertError },
    });
    await expect(saveProgressPhoto({ localUri: 'content://photo/7', capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null }, OWNER, OPERATION, f.deps)).rejects.toBe(insertError);
    expect(f.remove).toHaveBeenCalledWith([`${OWNER}/${OPERATION}.jpg`]);
  });

  test('retains its object when a lost insert response remains unconfirmed', async () => {
    const insertError = new Error('connection closed before response');
    const f = fixture({
      owners: [OWNER, OWNER, OWNER],
      existingPhoto: { data: null, error: null },
      insertedPhoto: { data: null, error: insertError },
      confirmedPhoto: { data: null, error: null },
    });

    await expect(saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null }, OWNER, OPERATION, f.deps)).rejects.toBe(insertError);
    expect(f.remove).not.toHaveBeenCalled();
  });

  test('retains an uploaded object when row confirmation is ambiguous', async () => {
    const insertError = new Error('response lost');
    const confirmationError = new Error('network unavailable');
    const f = fixture({
      owners: [OWNER, OWNER, OWNER],
      existingPhoto: { data: null, error: null },
      insertedPhoto: { data: null, error: insertError },
      confirmedPhoto: { data: null, error: confirmationError },
    });
    await expect(saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null }, OWNER, OPERATION, f.deps)).rejects.toBeInstanceOf(AggregateError);
    expect(f.remove).not.toHaveBeenCalled();
  });

  test('account change wins when failed-insert confirmation also fails after a switch', async () => {
    const f = fixture({
      owners: [OWNER, OWNER, OWNER, OWNER, OWNER, OTHER_OWNER],
      photoResponses: [
        { data: null, error: null },
        { data: null, error: new Error('insert response lost') },
        { data: null, error: new Error('confirmation failed') },
      ],
    });

    await expect(saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null }, OWNER, OPERATION, f.deps)).rejects.toThrow(
      'Account changed.',
    );
    expect(f.remove).not.toHaveBeenCalled();
  });

  test('retries an ambiguous operation by accepting only an existing-object conflict and inserting metadata', async () => {
    const insertError = new Error('insert response lost');
    const row = { id: 'p-retry', user_id: OWNER, storage_path: `${OWNER}/${OPERATION}.jpg`, captured_at: '2026-08-21T10:00:00.000Z', weight_kg: null };
    const f = fixture({
      photoResponses: [
        { data: null, error: null },
        { data: null, error: insertError },
        { data: null, error: null },
        { data: null, error: null },
        { data: row, error: null },
      ],
      uploadResponses: [
        { data: null, error: null },
        { data: null, error: { statusCode: '409', message: 'The resource already exists' } },
      ],
    });
    const input = { localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null } as const;

    await expect(saveProgressPhoto(input, OWNER, OPERATION, f.deps)).rejects.toBe(insertError);
    await expect(saveProgressPhoto(input, OWNER, OPERATION, f.deps)).resolves.toEqual({
      id: 'p-retry', storagePath: `${OWNER}/${OPERATION}.jpg`, capturedAt: input.capturedAt, weightKg: null,
    });
    expect(f.upload).toHaveBeenCalledTimes(2);
    expect(f.calls.inserts).toHaveLength(2);
  });

  test('accepts a lowercase canonical v4 operation path and replays its confirmed row', async () => {
    const row = { id: 'p-confirmed', user_id: OWNER, storage_path: `${OWNER}/${OPERATION}.jpg`, captured_at: '2026-08-21T10:00:00.000Z', weight_kg: '81.56' };
    const f = fixture({ photoResponses: [{ data: row, error: null }] });

    await expect(saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: row.captured_at, weightKg: 81.555 }, OWNER, OPERATION, f.deps)).resolves.toEqual({
      id: 'p-confirmed', storagePath: row.storage_path, capturedAt: row.captured_at, weightKg: 81.56,
    });
    expect(f.upload).not.toHaveBeenCalled();
    expect(f.calls.inserts).toEqual([]);
    expect(f.deps.readLocalImage).not.toHaveBeenCalled();
  });

  test('fails closed if an exact-path lookup returns a different canonical row', async () => {
    const f = fixture({
      photoResponses: [{
        data: { id: 'p-other', user_id: OWNER, storage_path: `${OWNER}/${OTHER_OPERATION}.jpg`, captured_at: '2026-08-21T10:00:00.000Z', weight_kg: null },
        error: null,
      }],
    });

    await expect(saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00Z', weightKg: null }, OWNER, OPERATION, f.deps)).rejects.toThrow(
      'Progress photo could not be verified.',
    );
    expect(f.deps.readLocalImage).not.toHaveBeenCalled();
    expect(f.upload).not.toHaveBeenCalled();
  });

  test('rejects a timezone-less captured timestamp before reading or writing', async () => {
    const f = fixture();
    await expect(saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00', weightKg: null }, OWNER, OPERATION, f.deps)).rejects.toThrow(
      'Progress photo could not be verified.',
    );
    expect(f.deps.readLocalImage).not.toHaveBeenCalled();
    expect(f.from).not.toHaveBeenCalled();
  });

  test('storage failure leaves metadata intact and a second call retries successfully', async () => {
    const photo = { id: 'p1', storagePath: `${OWNER}/${OPERATION}.jpg`, capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null } as const;
    const stored = { id: photo.id, user_id: OWNER, storage_path: photo.storagePath, captured_at: photo.capturedAt, weight_kg: null };
    const removalError = new Error('storage unavailable');
    const f = fixture({
      photoResponses: [
        { data: stored, error: null },
        { data: stored, error: null },
        { data: stored, error: null },
      ],
      removeResponses: [
        { result: { data: null, error: removalError } },
        { result: { data: null, error: null } },
      ],
    });

    await expect(deleteProgressPhoto(photo, OWNER, f.deps)).rejects.toBe(removalError);
    expect(f.calls.deletes).toBe(0);
    await expect(deleteProgressPhoto(photo, OWNER, f.deps)).resolves.toBeUndefined();
    expect(f.calls.deletes).toBe(1);
    expect(f.events.indexOf('remove')).toBeLessThan(f.events.indexOf('delete-row'));
  });

  test('retries after object removal succeeded but its response was lost', async () => {
    const photo = { id: 'p1', storagePath: `${OWNER}/${OPERATION}.jpg`, capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null } as const;
    const stored = { id: photo.id, user_id: OWNER, storage_path: photo.storagePath, captured_at: photo.capturedAt, weight_kg: null };
    const responseLost = new Error('response lost after removal');
    const notFound = { statusCode: 404, message: 'Object not found' };
    const f = fixture({
      photoResponses: [
        { data: stored, error: null },
        { data: stored, error: null },
        { data: stored, error: null },
      ],
      removeResponses: [
        { throws: responseLost },
        { result: { data: null, error: notFound } },
      ],
    });

    await expect(deleteProgressPhoto(photo, OWNER, f.deps)).rejects.toBe(responseLost);
    expect(f.calls.deletes).toBe(0);
    await expect(deleteProgressPhoto(photo, OWNER, f.deps)).resolves.toBeUndefined();
    expect(f.calls.deletes).toBe(1);
  });

  test('retries metadata deletion after storage was already removed', async () => {
    const photo = { id: 'p1', storagePath: `${OWNER}/${OPERATION}.jpg`, capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null } as const;
    const stored = { id: photo.id, user_id: OWNER, storage_path: photo.storagePath, captured_at: photo.capturedAt, weight_kg: null };
    const deleteError = new Error('delete unavailable');
    const notFound = { statusCode: '404', message: 'Object not found' };
    const f = fixture({
      photoResponses: [
        { data: stored, error: null },
        { data: null, error: deleteError },
        { data: stored, error: null },
        { data: stored, error: null },
      ],
      removeResponses: [
        { result: { data: null, error: null } },
        { result: { data: null, error: notFound } },
      ],
    });

    await expect(deleteProgressPhoto(photo, OWNER, f.deps)).rejects.toBe(deleteError);
    await expect(deleteProgressPhoto(photo, OWNER, f.deps)).resolves.toBeUndefined();
    expect(f.calls.deletes).toBe(2);
  });

  test('an already-complete retry verifies path absence and removes only a same-owner orphan idempotently', async () => {
    const photo = { id: 'p1', storagePath: `${OWNER}/${OPERATION}.jpg`, capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null } as const;
    const f = fixture({
      photoResponses: [
        { data: null, error: null },
        { data: null, error: null },
      ],
      removeResponses: [{ result: { data: null, error: { statusCode: 404, message: 'Object not found' } } }],
    });

    await expect(deleteProgressPhoto(photo, OWNER, f.deps)).resolves.toBeUndefined();
    expect(f.remove).toHaveBeenCalledWith([photo.storagePath]);
    expect(f.calls.deletes).toBe(0);
  });

  test('stale id/path collisions cannot remove an object or metadata row', async () => {
    const stale = { id: 'p1', storagePath: `${OWNER}/${OTHER_OPERATION}.jpg`, capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null } as const;
    const realById = { id: stale.id, user_id: OWNER, storage_path: `${OWNER}/${OPERATION}.jpg`, captured_at: stale.capturedAt, weight_kg: null };
    const idCollision = fixture({ photoResponses: [{ data: realById, error: null }] });
    await expect(deleteProgressPhoto(stale, OWNER, idCollision.deps)).rejects.toThrow('Progress photo could not be verified.');
    expect(idCollision.remove).not.toHaveBeenCalled();
    expect(idCollision.calls.deletes).toBe(0);

    const pathOwner = { ...realById, id: 'p2', storage_path: stale.storagePath };
    const pathCollision = fixture({ photoResponses: [{ data: null, error: null }, { data: pathOwner, error: null }] });
    await expect(deleteProgressPhoto(stale, OWNER, pathCollision.deps)).rejects.toThrow('Progress photo could not be verified.');
    expect(pathCollision.remove).not.toHaveBeenCalled();
    expect(pathCollision.calls.deletes).toBe(0);
  });

  test.each([
    `${OTHER_OWNER}/${OPERATION}.jpg`,
    `${OWNER}/${OPERATION}.png`,
    `${OWNER}/${OPERATION}.jpeg`,
    `${OWNER}/not-a-uuid.jpg`,
    `${OWNER}/${OPERATION}.jpg/extra`,
    `${OWNER}/../${OPERATION}.jpg`,
    `${OWNER}/${ALPHA_OPERATION.toUpperCase()}.jpg`,
    `${OWNER}//${OPERATION}.jpg`,
    ...NON_V4_OPERATIONS.map((operationId) => `${OWNER}/${operationId}.jpg`),
  ])('rejects non-canonical progress path %s before touching metadata', async (storagePath) => {
    const f = fixture({ deletedPhoto: { data: null, error: null } });
    await expect(deleteProgressPhoto({ id: 'p1', storagePath, capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null }, OWNER, f.deps)).rejects.toThrow(
      'Progress photo could not be verified.',
    );
    expect(f.from).not.toHaveBeenCalled();
  });

  test('account change wins when metadata deletion fails after a switch', async () => {
    const photo = { id: 'p1', storagePath: `${OWNER}/${OPERATION}.jpg`, capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null } as const;
    const stored = { id: photo.id, user_id: OWNER, storage_path: photo.storagePath, captured_at: photo.capturedAt, weight_kg: null };
    const f = fixture({
      owners: [OWNER, OWNER, OWNER, OTHER_OWNER],
      photoResponses: [
        { data: stored, error: null },
        { data: null, error: new Error('delete failed') },
      ],
    });

    await expect(deleteProgressPhoto(photo, OWNER, f.deps)).rejects.toThrow(
      'Account changed.',
    );
  });

  test('account change wins when storage removal fails after a switch', async () => {
    const photo = { id: 'p1', storagePath: `${OWNER}/${OPERATION}.jpg`, capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null } as const;
    const stored = { id: photo.id, user_id: OWNER, storage_path: photo.storagePath, captured_at: photo.capturedAt, weight_kg: null };
    const f = fixture({
      owners: [OWNER, OWNER, OTHER_OWNER],
      photoResponses: [{ data: stored, error: null }],
      remove: { data: null, error: new Error('remove failed') },
    });

    await expect(deleteProgressPhoto(photo, OWNER, f.deps)).rejects.toThrow(
      'Account changed.',
    );
  });

  test('uses safe signed-out copy and preserves authenticated provider errors', async () => {
    const authError = new Error('provider unavailable');
    const signedOut = fixture({ authResponses: [{ owner: null, error: authError }] });
    await expect(listProgressPhotos(OWNER, signedOut.deps)).rejects.toThrow('Not signed in.');

    const providerFailure = fixture({ authResponses: [{ owner: OWNER, error: authError }] });
    await expect(saveProgressPhoto({ localUri: 'file:///photo.jpg', capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null }, OWNER, OPERATION, providerFailure.deps)).rejects.toBe(authError);
    expect(providerFailure.from).not.toHaveBeenCalled();
    expect(providerFailure.upload).not.toHaveBeenCalled();
  });

  test('never deletes a wrong-owner path', async () => {
    const wrong = { id: 'p1', storagePath: `${OTHER_OWNER}/${OPERATION}.jpg`, capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null } as const;
    const wrongFixture = fixture();
    await expect(deleteProgressPhoto(wrong, OWNER, wrongFixture.deps)).rejects.toThrow('Progress photo could not be verified.');
    expect(wrongFixture.from).not.toHaveBeenCalled();
  });
});
