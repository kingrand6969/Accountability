import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  addMeasurement,
  deleteProgressPhoto,
  listMeasurements,
  listProgressPhotos,
  saveProgressPhoto,
  type ProgressApiDependencies,
} from './api';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER_OWNER = '22222222-2222-4222-8222-222222222222';
const OPERATION = '33333333-3333-4333-8333-333333333333';

type Response = { data: unknown; error: unknown };

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function fixture(options: {
  owners?: (string | null)[];
  listMeasurements?: Response;
  insertedMeasurement?: Response;
  listPhotos?: Response;
  existingPhoto?: Response;
  insertedPhoto?: Response;
  confirmedPhoto?: Response;
  deletedPhoto?: Response;
  upload?: Response | Promise<Response>;
  remove?: Response | Promise<Response>;
} = {}) {
  const events: string[] = [];
  const owners = [...(options.owners ?? [OWNER])];
  let lastOwner = owners[owners.length - 1] ?? null;
  const getUser = jest.fn(async () => {
    if (owners.length > 0) lastOwner = owners.shift() ?? null;
    events.push(`auth:${lastOwner ?? 'signed-out'}`);
    return { data: { user: lastOwner ? { id: lastOwner } : null }, error: null };
  });
  const upload = jest.fn(async () => {
    events.push('upload');
    return await (options.upload ?? { data: null, error: null });
  });
  const remove = jest.fn(async () => {
    events.push('remove');
    return await (options.remove ?? { data: null, error: null });
  });

  const measurementList = options.listMeasurements ?? { data: [], error: null };
  const photoList = options.listPhotos ?? { data: [], error: null };
  const measurementInsert = options.insertedMeasurement ?? { data: null, error: null };
  const photoExisting = options.existingPhoto ?? { data: null, error: null };
  const photoInsert = options.insertedPhoto ?? { data: null, error: null };
  const photoDelete = options.deletedPhoto ?? { data: null, error: null };

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
    readLocalImage: jest.fn(async () => {
      events.push('read-file');
      return { bytes: new Uint8Array([1, 2, 3]).buffer, contentType: 'image/jpeg' };
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
});

describe('progress photo APIs', () => {
  test('lists owner-bound photos in deterministic order and maps nullable numeric weight', async () => {
    const f = fixture({
      listPhotos: { data: [{ id: 'p1', user_id: OWNER, storage_path: `${OWNER}/opaque.jpg`, captured_at: '2026-08-21T10:00:00.000Z', weight_kg: null }], error: null },
    });
    await expect(listProgressPhotos(OWNER, f.deps)).resolves.toEqual([
      { id: 'p1', storagePath: `${OWNER}/opaque.jpg`, capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null },
    ]);
    expect(f.calls.selects).toContain('id,user_id,storage_path,captured_at,weight_kg');
    expect(f.calls.equals).toContainEqual(['user_id', OWNER]);
    expect(f.calls.orders).toEqual([
      ['captured_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
  });

  test('uploads a local image to an opaque owner path before inserting its row', async () => {
    const f = fixture({
      owners: [OWNER, OWNER, OWNER],
      existingPhoto: { data: null, error: null },
      insertedPhoto: { data: { id: 'p2', user_id: OWNER, storage_path: `${OWNER}/${OPERATION}.jpg`, captured_at: '2026-08-21T10:00:00.000Z', weight_kg: '81.5' }, error: null },
    });
    await expect(saveProgressPhoto({ localUri: 'file:///private/DCIM/my-name.jpg', capturedAt: '2026-08-21T10:00:00.000Z', weightKg: 81.5 }, OWNER, OPERATION, f.deps)).resolves.toMatchObject({ id: 'p2', storagePath: `${OWNER}/${OPERATION}.jpg` });
    expect(f.events.indexOf('upload')).toBeLessThan(f.events.indexOf('insert'));
    expect(f.upload).toHaveBeenCalledWith(
      `${OWNER}/${OPERATION}.jpg`,
      expect.any(ArrayBuffer),
      { contentType: 'image/jpeg', upsert: false },
    );
    expect(f.calls.inserts).toContainEqual({ user_id: OWNER, storage_path: `${OWNER}/${OPERATION}.jpg`, captured_at: '2026-08-21T10:00:00.000Z', weight_kg: 81.5 });
  });

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

  test('deletes confirmed owner metadata before storage and stops on an account switch', async () => {
    const photo = { id: 'p1', storagePath: `${OWNER}/${OPERATION}.jpg`, capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null } as const;
    const f = fixture({ owners: [OWNER, OTHER_OWNER], deletedPhoto: { data: { id: 'p1', user_id: OWNER, storage_path: photo.storagePath }, error: null } });
    await expect(deleteProgressPhoto(photo, OWNER, f.deps)).rejects.toThrow('Account changed.');
    expect(f.events).toContain('delete-row');
    expect(f.remove).not.toHaveBeenCalled();
  });

  test('never deletes a wrong-owner path and removes storage only after confirmed metadata deletion', async () => {
    const wrong = { id: 'p1', storagePath: `${OTHER_OWNER}/${OPERATION}.jpg`, capturedAt: '2026-08-21T10:00:00.000Z', weightKg: null } as const;
    const wrongFixture = fixture({ deletedPhoto: { data: null, error: null } });
    await expect(deleteProgressPhoto(wrong, OWNER, wrongFixture.deps)).rejects.toThrow('Progress photo could not be verified.');
    expect(wrongFixture.from).not.toHaveBeenCalled();

    const photo = { ...wrong, storagePath: `${OWNER}/${OPERATION}.jpg` };
    const f = fixture({ owners: [OWNER, OWNER], deletedPhoto: { data: { id: 'p1', user_id: OWNER, storage_path: photo.storagePath }, error: null } });
    await deleteProgressPhoto(photo, OWNER, f.deps);
    expect(f.events.indexOf('delete-row')).toBeLessThan(f.events.indexOf('remove'));
    expect(f.remove).toHaveBeenCalledWith([photo.storagePath]);
  });
});
