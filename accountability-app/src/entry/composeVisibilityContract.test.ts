import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const compose = readFileSync(require.resolve('../app/compose'), 'utf8');
const hub = readFileSync(require.resolve('./CreateHub'), 'utf8');

describe('Composer universal visibility contract', () => {
  test('defaults new personal posts to the shared Off switch with truthful copy and CTA', () => {
    expect(compose).toContain('useState(DEFAULT_SHOW_PUBLICLY)');
    expect(compose).toContain('<PostVisibilitySwitch');
    expect(compose).toContain('showPublicly={showPublicly}');
    expect(compose).toContain("showPublicly ? 'Announce publicly' : 'Announce to buddies'");
    expect(compose).toContain('{primaryActionLabel}');
    expect(compose).not.toContain('accessibilityRole="radiogroup"');
    expect(compose).not.toContain('Feature on my Buddy Card');
  });

  test('feeds the one scalar into canonical personal post, event, and edit APIs', () => {
    expect(compose).toMatch(/createPost\([\s\S]*?showPublicly: submittedShowPublicly,[\s\S]*?\);/);
    expect(compose).toMatch(/createEvent\(\{[\s\S]*?showPublicly: submittedShowPublicly/);
    expect(compose).toContain('updatePostVisibility(editingId, submittedShowPublicly, submittedOwner)');
    expect(compose).not.toContain('updatePostAudience');
  });

  test('normalizes legacy edit state and excludes scoped group or page edits', () => {
    expect(compose).toContain('normalizeStoredPostVisibility(post).showOnCard');
    expect(compose).toContain('setEditingScoped(Boolean(post.group_id || post.page_id || post.audience === \'group\'))');
    expect(compose).toContain('{!editingScoped ? (');
    expect(compose).toContain('if (!editingScoped && submittedVisibilityChanged) await updatePostVisibility');
    expect(compose).toContain('setVisibilityChanged(true)');
  });

  test('adds a front-camera selfie path through the shared capture adapter and owns cleanup', () => {
    expect(compose).toContain('captureComposerSelfie({');
    expect(compose).toContain("label: 'Take selfie'");
    expect(compose).toContain('releaseEditorPhoto()');
    expect(compose).toContain('releaseEditedPhotoUri(photo.uri)');
    expect(compose).toContain('PhotoPermissionDeniedError');
  });
});

describe('Create Hub routing contract', () => {
  test('routes Post directly and offers selfie, photo, and video without an audience step', () => {
    expect(hub).toContain('Take selfie');
    expect(hub).toContain('Choose photo');
    expect(hub).toContain('Choose video');
    expect(hub).not.toContain('Audience');
    expect(hub).not.toContain('audienceSegment');
  });
});
