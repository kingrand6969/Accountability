import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const read = (name: string) => readFileSync(path.join(__dirname, name), 'utf8');

describe('Discover hub contract', () => {
  test('offers compact people, groups, pages and interests destinations', () => {
    const source = read('DiscoverHub.tsx');
    expect(source).toContain("value: 'people'");
    expect(source).toContain("value: 'groups'");
    expect(source).toContain("value: 'pages'");
    expect(source).toContain("value: 'interests'");
    expect(source).toContain('accessibilityRole="tablist"');
    expect(source).toContain('<DiscoverExperience scope="people" />');
  });

  test('reuses discovery APIs and protects account-scoped async results', () => {
    const source = read('DiscoverHub.tsx');
    expect(source).toContain('listGroups()');
    expect(source).toContain('listPages()');
    expect(source).toContain("row.privacy === 'public'");
    expect(source).toContain('requestOwner !== currentOwnerRef.current');
    expect(source).toContain('Retry');
    expect(source).toContain('No public');
  });

  test('is a discovery surface, not a posting or Feed mode surface', () => {
    const source = read('DiscoverHub.tsx');
    expect(source).not.toMatch(/createPost|publishPost|SocialModeSelector|feedMode/);
    expect(source).toContain("router.push(`/group/${row.id}` as never)");
    expect(source).toContain("router.push(`/page/${row.id}` as never)");
  });
});
