import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import {
  CREATE_CHOICES,
  CREATE_HUB_MODEL,
  DIRECT_POST_HREF,
  createPickerReadinessGate,
  decideCreateContinuation,
  composerMediaChoices,
  composerCreateActions,
  resolveComposeMode,
  type CreateContinuation,
  type CreateMedia,
} from './createFlow';

describe('Composer media capability', () => {
  test('hides every unsupported create action while editing', () => {
    expect(composerMediaChoices('ios', true)).toEqual([]);
    expect(composerMediaChoices('android', true)).toEqual([]);
    expect(composerCreateActions('ios', true)).toEqual([]);
    expect(composerCreateActions('web', true)).toEqual([]);
  });

  test('hides selfie on web and keeps truthful gallery/video choices', () => {
    expect(composerMediaChoices('web', false)).toEqual(['photo', 'video']);
    expect(composerMediaChoices('ios', false)).toEqual(['selfie', 'photo', 'video']);
    expect(composerCreateActions('web', false)).toEqual(['photo', 'video', 'event']);
  });
});

describe('createPickerReadinessGate', () => {
  test('queues a selfie intent until owner and draft hydration are ready', () => {
    const gate = createPickerReadinessGate();
    expect(gate.request('selfie', false)).toBeNull();
    expect(gate.resolve(true)).toBe('selfie');
  });

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
    expect(CREATE_CHOICES.find((choice) => choice.id === 'my-day')).toMatchObject({
      title: 'Schedule',
      detail: 'Add a promise, task, or reminder',
      accessibilityLabel: 'Schedule. Add a promise, task, or reminder',
      route: '/add',
    });
    expect(CREATE_CHOICES.map((choice) => choice.route)).not.toContain('/today');
  });
});

describe('resolveComposeMode', () => {
  test.each([
    [{}, 'hub'],
    [{ text: '' }, 'post'],
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

  test('exposes a typed empty-post destination that bypasses the create hub', () => {
    expect(DIRECT_POST_HREF).toEqual({
      pathname: '/compose',
      params: { text: '' },
    });
    expect(resolveComposeMode(DIRECT_POST_HREF.params)).toBe('post');
  });
});

describe('decideCreateContinuation', () => {
  const cases: {
    choiceId: (typeof CREATE_CHOICES)[number]['id'];
    media: CreateMedia;
    expected: CreateContinuation;
  }[] = [
    { choiceId: 'post', media: 'photo', expected: { kind: 'editor' } },
    {
      choiceId: 'photo-video',
      media: 'selfie',
      expected: { kind: 'picker', media: 'selfie' },
    },
    {
      choiceId: 'photo-video',
      media: 'photo',
      expected: { kind: 'picker', media: 'photo' },
    },
    {
      choiceId: 'photo-video',
      media: 'video',
      expected: { kind: 'picker', media: 'video' },
    },
    { choiceId: 'flex', media: 'photo', expected: { kind: 'route', route: '/win-card' } },
    { choiceId: 'share-run', media: 'photo', expected: { kind: 'route', route: '/run' } },
    { choiceId: 'my-day', media: 'photo', expected: { kind: 'route', route: '/add' } },
  ];

  test.each(cases)('coordinates $choiceId with $media', ({ choiceId, media, expected }) => {
    expect(decideCreateContinuation({ choiceId, media })).toEqual(expected);
  });

  test('returns data only and cannot create or upload at Continue', () => {
    const decision = decideCreateContinuation({
      choiceId: 'photo-video',
      media: 'video',
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
    expect(CREATE_HUB_MODEL.sections).toEqual(['preview']);
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
    expect(hubSource).toContain('Take selfie');
    expect(hubSource).not.toContain('styles.audienceSegment');
    expect(hubSource).not.toContain('accessibilityRole="radiogroup" style={styles.audienceSegment}');
    expect(hubSource).not.toContain('<BrandMark');
  });

  test('reserves My Day wording for 24-hour stories, not the scheduler', () => {
    const addSource = readFileSync(require.resolve('../app/add'), 'utf8');

    expect(CREATE_HUB_MODEL.choices.map((choice) => choice.title)).not.toContain('Add to My Day');
    expect(CREATE_HUB_MODEL.choices.map((choice) => choice.title)).not.toContain('My Day');
    expect(addSource).toContain('title="Add to schedule"');
    expect(addSource).not.toContain('title="Add to my day"');
  });
});
