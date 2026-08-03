import { describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildExternalProofExport,
  buildFeedProofExport,
  buildMemoryProofExport,
  buildPhoneProofExport,
  createProofRenderAssetStore,
  type ProofExportInput,
  type ProofExportOptIns,
  type RenderAssetAdapter,
} from './proofExport';
import { buildProofCardSummary } from './ProofCaptureCard';

const safeInput: ProofExportInput = {
  brand: 'AccountAbility',
  headline: 'I showed up today.',
  format: 'portrait',
  metrics: { workouts: 3, activities: 5, streakDays: 8 },
  locationLabel: 'Kings Park',
  routeImage: undefined,
  amountDisplay: '$50',
  buddyDisplayNames: ['Alex', 'Sam'],
  buddyPortraitImages: undefined,
};

const noOptIns: ProofExportOptIns = {};
const allOptIns: ProofExportOptIns = {
  location: true,
  route: true,
  amount: true,
  buddyNames: true,
  buddyPortraits: true,
};

const builders: [string, typeof buildFeedProofExport][] = [
  ['feed', buildFeedProofExport],
  ['external', buildExternalProofExport],
  ['phone', buildPhoneProofExport],
  ['memory', buildMemoryProofExport],
];

describe('Share Proof screen safety contract', () => {
  const screenSource = readFileSync(resolve(__dirname, '../app/win-card.tsx'), 'utf8');
  const layoutSource = readFileSync(resolve(__dirname, '../app/_layout.tsx'), 'utf8');
  const cardSource = readFileSync(resolve(__dirname, './ProofCaptureCard.tsx'), 'utf8');

  test('uses one safe custom header in loading, error, and ready states', () => {
    expect(screenSource.match(/<View style=\{styles\.screenHeader\}>/g)).toHaveLength(1);
    expect(screenSource.match(/<ScreenHeader onBack=\{goBack\} \/>/g)).toHaveLength(2);
    expect(screenSource).toContain('accessibilityRole="button"');
    expect(screenSource).toContain('accessibilityLabel="Retry loading Daily Proof"');
    expect(layoutSource).toContain(
      '<Stack.Screen name="win-card" options={{ headerShown: false }} />',
    );
  });

  test('captures the trusted bundled runner hero without a raw URI source', () => {
    expect(cardSource).toContain(
      "require('../../assets/images/proof-runner-hero-v1.webp')",
    );
    expect(cardSource).toContain('source={PROOF_RUNNER_HERO}');
    expect(cardSource).not.toContain('source={{ uri:');
    expect(cardSource).not.toContain('context.resolve');
  });

  test('uses real safe-area insets and preserves scalable controls outside fixed artwork', () => {
    expect(screenSource).toContain('useSafeAreaInsets()');
    expect(screenSource).toContain('Math.max(insets.bottom, 18)');
    expect(screenSource).not.toContain('allowFontScaling={false}');
    expect(cardSource).toContain('allowFontScaling={false}');
  });

  test.each(['portrait', 'square', 'landscape'] as const)(
    'exposes one complete privacy-filtered card summary in %s format',
    (format) => {
      expect(buildProofCardSummary(buildExternalProofExport(
        { ...safeInput, format },
        allOptIns,
      ))).toBe(
        `AccountAbility. I showed up today. 3 workouts. 5 activities. 8 day streak. ` +
        `Location: Kings Park. Amount: $50. Buddies: Alex, Sam. ${format} format.`,
      );
    },
  );

  test('uses singular metric labels when each exported value is exactly one', () => {
    const summary = buildProofCardSummary(buildExternalProofExport({
      ...safeInput,
      metrics: { workouts: 1, activities: 1, streakDays: 1 },
    }, noOptIns));

    expect(summary).toContain('1 workout. 1 activity. 1 day streak.');
  });
});
const singleOptInCases: [
  string,
  ProofExportOptIns,
  string,
  string | readonly string[],
][] = [
  ['location', { location: true }, 'locationLabel', 'Kings Park'],
  ['amount', { amount: true }, 'amountDisplay', '$50'],
  ['buddy names', { buddyNames: true }, 'buddyDisplayNames', ['Alex', 'Sam']],
];

describe.each(builders)('%s proof export', (_destination, build) => {
  test.each(['portrait', 'square', 'landscape'] as const)(
    'preserves exact DTO shape in %s format',
    (format) => {
      expect(build({ ...safeInput, format }, noOptIns)).toEqual({
        brand: 'AccountAbility',
        headline: 'I showed up today.',
        format,
        metrics: { workouts: 3, activities: 5, streakDays: 8 },
      });
    },
  );

  test('constructs the exact safe keyset with no opt-ins', () => {
    expect(build(safeInput, noOptIns)).toEqual({
      brand: 'AccountAbility',
      headline: 'I showed up today.',
      format: 'portrait',
      metrics: { workouts: 3, activities: 5, streakDays: 8 },
    });
  });

  test('drops renderer-only background capabilities from DTO input', () => {
    expect(build({ ...safeInput, backgroundImage: {} } as ProofExportInput, noOptIns)).toEqual(
      build(safeInput, noOptIns),
    );
  });

  test.each(singleOptInCases)('allows only the single %s opt-in', (_name, optIns, key, value) => {
    const output = build(safeInput, optIns);
    expect(output).toEqual({
      brand: 'AccountAbility',
      headline: 'I showed up today.',
      format: 'portrait',
      metrics: { workouts: 3, activities: 5, streakDays: 8 },
      [key]: value,
    });
  });

  test('fails closed for malformed opt-ins', () => {
    expect(build(safeInput, {
      location: 1,
      amount: 'true',
      buddyNames: new Boolean(true),
    } as unknown as ProofExportOptIns)).toEqual(build(safeInput, noOptIns));
  });

  test('all legal scalar opt-ins remain independent', () => {
    expect(build(safeInput, allOptIns)).toEqual({
      brand: 'AccountAbility',
      headline: 'I showed up today.',
      format: 'portrait',
      metrics: { workouts: 3, activities: 5, streakDays: 8 },
      locationLabel: 'Kings Park',
      amountDisplay: '$50',
      buddyDisplayNames: ['Alex', 'Sam'],
    });
  });

  test('drops adversarial top-level and nested content recursively', () => {
    const adversarial = {
      ...safeInput,
      user_id: '123e4567-e89b-42d3-a456-426614174000',
      post_id: 'private',
      audio: 'file:///private/proof.m4a',
      metrics: {
        workouts: 3,
        activities: 5,
        streakDays: 8,
        coordinates: [-31.9, 115.8],
        storage: 'r2://private',
      },
      locationLabel: 'https://project.supabase.co/storage/v1/private',
      amountDisplay: 'content://private',
      buddyDisplayNames: [{ user_id: 'private', name: 'Alex' }],
      nested: {
        signed: 'https://media.example/photo?X-Amz-Signature=private',
        encoded: 'ZmlsZTovLy9wcml2YXRl',
        cloud: 'pub.cloudflarestorage.com',
      },
    } as unknown as ProofExportInput;
    const output = build(adversarial, allOptIns);

    expect(Object.keys(output).sort()).toEqual(['brand', 'format', 'headline', 'metrics']);
    expect(output.metrics).toEqual({ workouts: 3, activities: 5, streakDays: 8 });
    expect(JSON.stringify(output)).not.toMatch(
      /r2:|file:|content:|supabase|cloudflarestorage|X-Amz-|user_id|post_id|[0-9a-f]{8}-[0-9a-f-]{27,}/i,
    );
  });

  test.each([
    'ZmlsZTovLy9wcml2YXRlL3Byb29mLmpwZw==',
    'cjI6Ly9wcml2YXRlL3Byb29mLmpwZw',
    'aHR0cHM6Ly9wcm9qZWN0LnN1cGFiYXNlLmNvL3N0b3JhZ2UvdjEvcHJpdmF0ZQ==',
    'MTIzZTQ1NjctZTg5Yi00MmQzLWE0NTYtNDI2NjE0MTc0MDAw',
  ])('rejects bounded base64 private data in every scalar position', (encoded) => {
    const output = build(
      {
        brand: encoded,
        headline: encoded,
        format: encoded,
        metrics: {
          workouts: encoded,
          activities: encoded,
          streakDays: encoded,
          nested: encoded,
        },
        locationLabel: encoded,
        amountDisplay: encoded,
        buddyDisplayNames: [encoded],
      },
      allOptIns,
    );

    expect(output).toEqual({
      brand: '',
      headline: '',
      format: 'portrait',
      metrics: { workouts: 0, activities: 0, streakDays: 0 },
    });
    expect(JSON.stringify(output)).not.toContain(encoded);
  });
});

function makeAdapter(overrides: Partial<RenderAssetAdapter> = {}): RenderAssetAdapter {
  return {
    managedRoot: 'file:///app/proof-render/',
    stageLocal: jest.fn(async () => ({
      tempUri: 'file:///app/proof-render/tmp-1',
      finalUri: 'file:///app/proof-render/final-1.png',
      mimeType: 'image/png',
      byteLength: 100,
      width: 40,
      height: 50,
      decoded: true,
      canonicalFinalUri: 'file:///app/proof-render/final-1.png',
      symlinkFree: true,
    })),
    stageRemote: jest.fn(async () => ({
      tempUri: 'file:///app/proof-render/tmp-2',
      finalUri: 'file:///app/proof-render/final-2.png',
      mimeType: 'image/png',
      byteLength: 100,
      width: 40,
      height: 50,
      decoded: true,
      canonicalFinalUri: 'file:///app/proof-render/final-2.png',
      symlinkFree: true,
      redirectHosts: ['media.example'],
    })),
    atomicMove: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('trusted proof render asset store', () => {
  test('creates opaque, non-enumerable and non-serializable handles', async () => {
    const store = createProofRenderAssetStore(makeAdapter(), {
      approvedRemoteHosts: ['media.example'],
      maxBytes: 1024,
      maxPixels: 10_000,
    });
    const handle = await store.create('owner-1', {
      kind: 'remote',
      url: 'https://media.example/avatar.png',
    });

    expect(Object.keys(handle)).toEqual([]);
    expect(Object.getOwnPropertyNames(handle)).toEqual([]);
    expect(Object.getOwnPropertySymbols(handle)).toEqual([]);
    expect(() => String(handle)).toThrow('Render asset is opaque');
    expect(() => JSON.stringify(handle)).toThrow('Render asset is opaque');
    expect(() => JSON.stringify({ handle })).toThrow('Render asset is opaque');
  });

  test('includes route and portraits only under their exact independent opt-ins', async () => {
    const store = createProofRenderAssetStore(makeAdapter(), {
      approvedRemoteHosts: ['media.example'],
      maxBytes: 1024,
      maxPixels: 10_000,
    });
    const route = await store.create('owner-1', {
      kind: 'remote',
      url: 'https://media.example/route',
    });
    const portrait1 = await store.create('owner-1', {
      kind: 'remote',
      url: 'https://media.example/p1',
    });
    const portrait2 = await store.create('owner-1', {
      kind: 'remote',
      url: 'https://media.example/p2',
    });
    const input = {
      ...safeInput,
      routeImage: route,
      buddyPortraitImages: [portrait1, portrait2],
    };

    for (const [, build] of builders) {
      expect(build(input, noOptIns)).not.toHaveProperty('routeImage');
      expect(build(input, noOptIns)).not.toHaveProperty('buddyPortraitImages');
      expect(build(input, { route: true })).toEqual({
        ...build(safeInput, noOptIns),
        routeImage: route,
      });
      expect(build(input, { buddyPortraits: true })).toEqual({
        ...build(safeInput, noOptIns),
        buddyPortraitImages: [portrait1, portrait2],
      });
      expect(build(input, allOptIns)).toEqual({
        brand: 'AccountAbility',
        headline: 'I showed up today.',
        format: 'portrait',
        metrics: { workouts: 3, activities: 5, streakDays: 8 },
        locationLabel: 'Kings Park',
        routeImage: route,
        amountDisplay: '$50',
        buddyDisplayNames: ['Alex', 'Sam'],
        buddyPortraitImages: [portrait1, portrait2],
      });
    }
  });

  test('only resolves same-owner live authentic handles and preserves portrait order', async () => {
    const store = createProofRenderAssetStore(makeAdapter(), {
      approvedRemoteHosts: ['media.example'],
      maxBytes: 1024,
      maxPixels: 10_000,
    });
    const first = await store.create('owner-1', { kind: 'remote', url: 'https://media.example/a' });
    const second = await store.create('owner-1', { kind: 'remote', url: 'https://media.example/b' });

    expect(store.resolveForCapture('owner-1', [first, second])).toEqual([
      'file:///app/proof-render/final-2.png',
      'file:///app/proof-render/final-2.png',
    ]);
    expect(() => store.resolveForCapture('owner-2', [first])).toThrow('Render asset unavailable');
    expect(() => store.resolveForCapture('owner-1', [{} as never])).toThrow(
      'Render asset unavailable',
    );
    await store.revoke(first);
    expect(() => store.resolveForCapture('owner-1', [first])).toThrow('Render asset unavailable');
  });

  test.each([
    ['MIME', { mimeType: 'image/gif' }],
    ['bytes', { byteLength: 1025 }],
    ['dimensions', { width: 101, height: 100 }],
    ['decode', { decoded: false }],
    ['containment', { canonicalFinalUri: 'file:///other/private.png' }],
    ['symlink', { symlinkFree: false }],
  ])('rejects invalid %s and cleans staged files', async (_name, patch) => {
    const adapter = makeAdapter({
      stageRemote: jest.fn(async () => ({
        tempUri: 'file:///app/proof-render/tmp-x',
        finalUri: 'file:///app/proof-render/final-x.png',
        mimeType: 'image/png',
        byteLength: 100,
        width: 40,
        height: 50,
        decoded: true,
        canonicalFinalUri: 'file:///app/proof-render/final-x.png',
        symlinkFree: true,
        redirectHosts: ['media.example'],
        ...patch,
      })),
    });
    const store = createProofRenderAssetStore(adapter, {
      approvedRemoteHosts: ['media.example'],
      maxBytes: 1024,
      maxPixels: 10_000,
    });

    await expect(
      store.create('owner-1', { kind: 'remote', url: 'https://media.example/avatar.png' }),
    ).rejects.toThrow('Render asset unavailable');
    expect(adapter.atomicMove).not.toHaveBeenCalled();
    expect(adapter.delete).toHaveBeenCalledWith('file:///app/proof-render/tmp-x');
    expect(adapter.delete).toHaveBeenCalledWith('file:///app/proof-render/final-x.png');
  });

  test.each([
    'file:///private/avatar.png',
    'https://evil.example/avatar.png',
    'https://media.example/avatar.png?X-Amz-Signature=secret',
    'https://media.example/avatar.png?token=secret',
    'https://project.supabase.co/storage/v1/avatar.png',
  ])('rejects unsafe public source %s without staging', async (url) => {
    const adapter = makeAdapter();
    const store = createProofRenderAssetStore(adapter, {
      approvedRemoteHosts: ['media.example'],
      maxBytes: 1024,
      maxPixels: 10_000,
    });

    await expect(store.create('owner-1', { kind: 'remote', url })).rejects.toThrow(
      'Render asset unavailable',
    );
    expect(adapter.stageRemote).not.toHaveBeenCalled();
  });

  test('rejects an unapproved redirect and cleans without moving', async () => {
    const adapter = makeAdapter({
      stageRemote: jest.fn(async () => ({
        tempUri: 'file:///app/proof-render/tmp-x',
        finalUri: 'file:///app/proof-render/final-x.png',
        mimeType: 'image/png',
        byteLength: 100,
        width: 40,
        height: 50,
        decoded: true,
        canonicalFinalUri: 'file:///app/proof-render/final-x.png',
        symlinkFree: true,
        redirectHosts: ['media.example', 'evil.example'],
      })),
    });
    const store = createProofRenderAssetStore(adapter, {
      approvedRemoteHosts: ['media.example'],
      maxBytes: 1024,
      maxPixels: 10_000,
    });

    await expect(
      store.create('owner-1', { kind: 'remote', url: 'https://media.example/avatar.png' }),
    ).rejects.toThrow('Render asset unavailable');
    expect(adapter.atomicMove).not.toHaveBeenCalled();
  });

  test('revokes one/all owner assets and deletes final managed bitmaps', async () => {
    const adapter = makeAdapter();
    const store = createProofRenderAssetStore(adapter, {
      approvedRemoteHosts: ['media.example'],
      maxBytes: 1024,
      maxPixels: 10_000,
    });
    const first = await store.create('owner-1', { kind: 'remote', url: 'https://media.example/a' });
    await store.create('owner-2', { kind: 'remote', url: 'https://media.example/b' });

    await store.revokeOwner('owner-1');
    expect(() => store.resolveForCapture('owner-1', [first])).toThrow('Render asset unavailable');
    expect(adapter.delete).toHaveBeenCalledWith('file:///app/proof-render/final-2.png');
    await store.dispose();
    expect(adapter.delete).toHaveBeenCalledTimes(2);
  });
});
