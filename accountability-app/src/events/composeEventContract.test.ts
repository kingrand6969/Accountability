import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const compose = readFileSync(resolve(process.cwd(), 'src/app/compose.tsx'), 'utf8');

describe('event composer contract', () => {
  test('uses the draft operation and initiating owner for the atomic event RPC', () => {
    expect(compose).toMatch(/const operationId = submittedDraft\?\.draftId \?\? draftId;[\s\S]*?createEvent\(\{/);
    expect(compose).toMatch(/createEvent\(\{[\s\S]*?expectedOwnerId: submittedOwner[\s\S]*?operationId/);
    expect(compose).toMatch(/createEvent\(\{[\s\S]*?audience[\s\S]*?showOnCard: normalizeBuddyCardFeature\(audience, showOnCard\)/);
  });

  test('makes Event and media mutually exclusive instead of ignoring attachments', () => {
    expect(compose).toContain('const hasAttachedMedia = Boolean(');
    expect(compose).toContain("if (eventOpenRef.current) return;");
    expect(compose).toMatch(/label="Photo"[\s\S]*?disabled=\{eventOpen\}/);
    expect(compose).toMatch(/label="Video"[\s\S]*?disabled=\{eventOpen\}/);
    expect(compose).toMatch(/label="Event"[\s\S]*?disabled=\{hasAttachedMedia\}/);
    expect(compose).toContain('accessibilityState={{ disabled }}');
  });

  test('normalizes unsupported legacy event draft options instead of silently submitting them', () => {
    expect(compose).toContain('const restoredEventOpen = draft.event.open && !draft.media;');
    expect(compose).toContain('setTaggedIds(restoredEventOpen ? new Set() : new Set(draft.tagIds));');
    expect(compose).toContain('setKeepInMemories(restoredEventOpen ? false : draft.keepInMemories);');
    expect(compose).toMatch(/eventOpen[\s\S]*?taggedIds\.size === 0[\s\S]*?!keepInMemories/);
  });
});
