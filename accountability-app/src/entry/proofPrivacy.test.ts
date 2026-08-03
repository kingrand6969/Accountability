import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_PROOF_PRIVACY,
  redactProofFields,
  sanitizeProofParam,
  type ProofPrivacy,
} from './proofPrivacy';

describe('Daily Proof privacy policy', () => {
  test('defaults every contract-sensitive proof field to hidden', () => {
    expect(DEFAULT_PROOF_PRIVACY).toEqual({
      hideLocation: true,
      hideRoute: true,
      hideAmounts: true,
      hideBuddyNames: true,
      hideBuddyPortraits: true,
    });
  });

  test('constructs a new allowlisted model and removes hidden and unknown fields', () => {
    const input = {
      brand: 'AccountAbility',
      headline: 'I showed up today.',
      format: 'portrait',
      workouts: 3,
      activities: 5,
      streak: 8,
      location: 'Kings Park',
      route: 'River loop',
      amounts: '$42.00',
      buddyNames: ['Alex'],
      buddyPortraits: ['r2://private/alex.jpg'],
      user_id: 'internal-user',
      audio: 'file:///private/proof.m4a',
      nested: { signedUrl: 'https://example.test/photo?X-Amz-Signature=secret' },
    };

    expect(redactProofFields(input, DEFAULT_PROOF_PRIVACY)).toEqual({
      brand: 'AccountAbility',
      headline: 'I showed up today.',
      format: 'portrait',
      workouts: 3,
      activities: 5,
      streak: 8,
    });
  });

  test('includes only explicitly opted-in sensitive fields', () => {
    const privacy: ProofPrivacy = {
      ...DEFAULT_PROOF_PRIVACY,
      hideLocation: false,
      hideAmounts: false,
    };

    expect(
      redactProofFields(
        {
          brand: 'AccountAbility',
          location: 'Kings Park',
          route: 'River loop',
          amounts: '$42.00',
          buddyNames: ['Alex'],
          buddyPortraits: ['https://public.example/alex.jpg'],
        },
        privacy,
      ),
    ).toEqual({
      brand: 'AccountAbility',
      location: 'Kings Park',
      amounts: '$42.00',
    });
  });

  test('rejects unsafe content even when it is placed in an allowlisted field', () => {
    expect(
      redactProofFields(
        {
          headline: 'r2://private/proof',
          location: 'https://project.supabase.co/storage/v1/private',
          amounts: 'safe\u0000hidden',
        },
        {
          hideLocation: false,
          hideRoute: false,
          hideAmounts: false,
          hideBuddyNames: false,
          hideBuddyPortraits: false,
        },
      ),
    ).toEqual({});
  });

  test('fails closed for raw buddy portrait URIs even with portrait visibility opted in', () => {
    expect(
      redactProofFields(
        { buddyPortraits: ['https://public.example/buddy.jpg'] },
        { ...DEFAULT_PROOF_PRIVACY, hideBuddyPortraits: false },
      ),
    ).toEqual({});
  });
});

describe('sanitizeProofParam', () => {
  test('normalizes whitespace and enforces a bounded scalar length', () => {
    expect(sanitizeProofParam('  Kings    Park   run  ')).toBe('Kings Park run');
    expect(sanitizeProofParam('a'.repeat(120))).toBe('a'.repeat(80));
    expect(sanitizeProofParam(['r2://private', 42, '  first valid  ', 'ignored'])).toBe(
      'first valid',
    );
    expect(sanitizeProofParam([['nested'], 'ignored'])).toBe('ignored');
    expect(sanitizeProofParam({ value: 'nested' })).toBeNull();
  });

  test.each([
    'r2://share-cards/private',
    'file:///private/proof.jpg',
    'content://media/external/images/1',
    'data:image/png;base64,private',
    'javascript:alert(1)',
    'blob:https://example.test/private',
    'mailto:private@example.test',
    'https://project.supabase.co/storage/v1/object/sign/private/photo.jpg',
    'https://pub.cloudflarestorage.com/private/photo.jpg',
    'https://example.test/photo?X-Amz-Signature=secret',
    'https://example.test/photo?token=secret',
    'https%3A%2F%2Fproject.supabase.co%2Fstorage%2Fv1%2Fobject%2Fsign%2Fphoto',
    'r2%253A%252F%252Fprivate%252Fphoto.jpg',
    'r2%2525253A%2525252F%2525252Fprivate%2525252Fphoto.jpg',
    'user_id=123e4567-e89b-42d3-a456-426614174000',
    'buddy_id=opaque-private-value',
    'memory_id=opaque-private-value',
    'id=opaque-private-value',
    '123e4567-e89b-42d3-a456-426614174000',
    '123e4567e89b42d3a456426614174000',
    'AWSAccessKeyId=secret',
    'Credential=secret/scope',
    'Signature=secret',
    'safe\u202Ehidden',
    'safe\u2066hidden',
    'safe\u200Bhidden',
    'safe\u0000hidden',
    'safe\rhidden',
    'ZmlsZTovLy9wcml2YXRlL3Byb29mLmpwZw==',
    'cjI6Ly9wcml2YXRlL3Byb29mLmpwZw',
    'aHR0cHM6Ly9wcm9qZWN0LnN1cGFiYXNlLmNvL3N0b3JhZ2UvdjEvcHJpdmF0ZQ==',
    'MTIzZTQ1NjctZTg5Yi00MmQzLWE0NTYtNDI2NjE0MTc0MDAw',
  ])('rejects private, signed, storage, control, and encoded input: %s', (value) => {
    expect(sanitizeProofParam(value)).toBeNull();
  });
});

describe('captured Daily Proof binding', () => {
  test('the captured subtree reads proof content only from cardModel', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../app/win-card.tsx'),
      'utf8',
    );
    const capturedSubtree = fs.readFileSync(
      path.resolve(__dirname, './ProofCaptureCard.tsx'),
      'utf8',
    );

    expect(capturedSubtree).not.toMatch(/\bstats\.|\bparams\.|\bproof(?:Location|Route|Amount|Buddy)/);
    expect(capturedSubtree).toMatch(/cardModel\.metrics\.workouts/);
    expect(capturedSubtree).toMatch(/cardModel\.metrics\.activities/);
    expect(capturedSubtree).toMatch(/cardModel\.metrics\.streakDays/);
    expect(capturedSubtree).toMatch(/cardModel\.headline/);
    expect(source).not.toMatch(/params\.buddyPortrait|proofBuddyPortrait/);
    expect(capturedSubtree).not.toMatch(/\bphotoUri\b/);
    expect(source).toMatch(/captureDestination\(\s*buildFeedProofExport,/);
    // Each explicit destination captures exactly once. Posting to Feed must not
    // trigger a second, unrelated external-share capture.
    expect(source.match(/captureDestination\(\s*buildExternalProofExport,/g)).toHaveLength(1);
    expect(source).toMatch(/captureDestination\(\s*buildPhoneProofExport,/);
    expect(source).toMatch(/captureDestination\(\s*buildMemoryProofExport,/);
    expect(source).toMatch(/<ProofCaptureCard context=\{captureContext\} \/>/);
    expect(source).toMatch(/accessibilityLabel=\{label\}/);
    expect(source).not.toMatch(/ImagePicker|pickerPhotoReference|renderBackgroundUri|Image\.getSize/);
    expect(capturedSubtree).toMatch(/source=\{PROOF_RUNNER_HERO\}/);
    expect(capturedSubtree).not.toMatch(/context\.resolve|source=\{\{\s*uri:/);
    expect(capturedSubtree).not.toMatch(
      /\bparams\.|\bstats\.|pickerPhotoReference|renderBackgroundUri|file:\/\/|content:\/\//,
    );
    expect(capturedSubtree.match(/allowFontScaling=\{false\}/g)?.length).toBeGreaterThanOrEqual(8);
    expect(capturedSubtree).toMatch(/buildProofCardSummary/);
  });
});
