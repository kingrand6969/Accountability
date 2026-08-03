import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import {
  CREATE_CHOICES,
  CREATE_HUB_MODEL,
  createPickerReadinessGate,
  decideCreateContinuation,
  resolveComposeMode,
  type CreateContinuation,
  type CreateMedia,
} from './createFlow';

describe('createPickerReadinessGate', () => {
  test('queues a cold photo intent until owner and draft hydration are ready', () => {
    const gate = createPickerReadinessGate();
    expect(gate.request('photo', false)).toBeNull();
    expect(gate.resolve(false)).toBeNull();
    expect(gate.resolve(true)).toBe('photo');
    expect(gate.resolve(true)).toBeNull();
  });

  test('queues hub photo or video selection before hydration and launches only the latest intent', () => {
    const gate = createPickerReadinessGate();
    expect(gate.request('photo', false)).toBeNull();
    expect(gate.request('video', false)).toBeNull();
    expect(gate.resolve(true)).toBe('video');
  });

  test('clears a queued intent when the owner detaches', () => {
    const gate = createPickerReadinessGate('photo');
    gate.clear();
    expect(gate.resolve(true)).toBeNull();
  });
});

describe('CREATE_CHOICES', () => {
  test('exposes exactly the five approved choices in order', () => {
    expect(CREATE_CHOICES.map((choice) => choice.id)).toEqual([
      'post',
      'photo-video',
      'flex',
      'share-run',
      'my-day',
    ]);
  });

  test('gives each choice an accessible label and one route or in-screen action', () => {
    for (const choice of CREATE_CHOICES) {
      expect(choice.accessibilityLabel.trim()).not.toBe('');
      expect(Number(choice.route !== null) + Number(choice.action !== null)).toBe(1);
    }

    expect(CREATE_CHOICES.find((choice) => choice.id === 'photo-video')).toMatchObject({
      route: null,
      action: 'choose-media',
    });
    expect(CREATE_CHOICES.find((choice) => choice.id === 'my-day')?.route).toBe('/add');
    expect(CREATE_CHOICES.map((choice) => choice.route)).not.toContain('/today');
  });
});

describe('resolveComposeMode', () => {
  test.each([
    [{}, 'hub'],
    [{ text: 'hello' }, 'post'],
    [{ photo: '1' }, 'photo'],
    [{ event: '1' }, 'event'],
    [{ edit: 'post-1' }, 'edit'],
  ])('resolves %o to %s', (params, expected) => {
    expect(resolveComposeMode(params)).toBe(expected);
  });

  test('gives edit precedence over every create query', () => {
    expect(resolveComposeMode({ edit: 'post-1', photo: '1', event: '1', text: 'hello' })).toBe(
      'edit',
    );
  });
});

describe('decideCreateContinuation', () => {
  const cases: {
    choiceId: (typeof CREATE_CHOICES)[number]['id'];
    media: CreateMedia;
    expected: CreateContinuation;
  }[] = [
    { choiceId: 'post', media: 'photo', expected: { kind: 'editor', audience: 'public' } },
    {
      choiceId: 'photo-video',
      media: 'photo',
      expected: { kind: 'picker', media: 'photo', audience: 'public' },
    },
    {
      choiceId: 'photo-video',
      media: 'video',
      expected: { kind: 'picker', media: 'video', audience: 'public' },
    },
    { choiceId: 'flex', media: 'photo', expected: { kind: 'route', route: '/win-card' } },
    { choiceId: 'share-run', media: 'photo', expected: { kind: 'route', route: '/run' } },
    { choiceId: 'my-day', media: 'photo', expected: { kind: 'route', route: '/add' } },
  ];

  test.each(cases)('coordinates $choiceId with $media', ({ choiceId, media, expected }) => {
    expect(decideCreateContinuation({ choiceId, media, audience: 'public' })).toEqual(expected);
  });

  test('returns data only and cannot create or upload at Continue', () => {
    const decision = decideCreateContinuation({
      choiceId: 'photo-video',
      media: 'video',
      audience: 'buddies',
    });

    expect(Object.values(decision).every((value) => typeof value !== 'function')).toBe(true);
  });
});

describe('production binding', () => {
  test('publishes the exact rendered hub model', () => {
    expect(CREATE_HUB_MODEL.choices).toBe(CREATE_CHOICES);
    expect(CREATE_HUB_MODEL.choices.map((choice) => choice.id)).toEqual([
      'post',
      'photo-video',
      'flex',
      'share-run',
      'my-day',
    ]);
    expect(CREATE_HUB_MODEL.sections).toEqual(['preview', 'audience']);
    expect(CREATE_HUB_MODEL.continueLabel).toBe('Continue');
  });

  test('Compose consumes the resolver and coordinator while CreateHub consumes the render model', () => {
    const composeSource = readFileSync(require.resolve('../app/compose'), 'utf8');
    const hubSource = readFileSync(require.resolve('./CreateHub'), 'utf8');

    expect(composeSource).toContain('resolveComposeMode(params)');
    expect(composeSource).toContain('decideCreateContinuation(');
    expect(composeSource).toContain('requestMediaPicker(decision.media)');
    expect(composeSource).toContain("createPickerReadinessGate(params.photo === '1' ? 'photo' : null)");
    expect(composeSource).toContain('pickerReadinessGate.clear()');
    expect(composeSource).not.toContain("if (params.photo === '1') onPickPhoto()");
    expect(hubSource).toContain('CREATE_HUB_MODEL.choices.map(');
    expect(hubSource).toContain('CREATE_HUB_MODEL.continueLabel');
    expect((hubSource.match(/onContinue\(/g) ?? [])).toHaveLength(1);
    expect(hubSource).not.toMatch(/createPost|uploadPost(Image|Video)/);
  });

  test('renders the compact reference hierarchy without duplicate branding', () => {
    const hubSource = readFileSync(require.resolve('./CreateHub'), 'utf8');

    expect(hubSource).toContain('Choose what to create');
    expect(hubSource).toContain('name="chevron-forward"');
    expect(hubSource).toContain('styles.previewArtwork');
    expect(hubSource).toContain('styles.audienceSegment');
    expect(hubSource).not.toContain('<BrandMark');
  });
});
