import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

const proof = readFileSync(require.resolve('./FeedProofCard'), 'utf8');
const postImage = readFileSync(require.resolve('./PostImage'), 'utf8');

function styleBlock(source: string, name: string): string {
  return source.match(new RegExp(`${name}:\\s*\\{([\\s\\S]*?)\\n  \\},`))?.[1] ?? '';
}

describe('Editorial Motion post canvas', () => {
  test('places generic media before its caption while text-only posts remain natural height', () => {
    const mediaIndex = proof.indexOf('testID="feed-post-media"');
    const bodyIndex = proof.indexOf('testID="feed-post-body"');

    expect(mediaIndex).toBeGreaterThanOrEqual(0);
    expect(bodyIndex).toBeGreaterThanOrEqual(0);
    expect(mediaIndex).toBeLessThan(bodyIndex);
    expect(proof).toContain('{post.image_url ? (');
    expect(proof).toContain("{post.body && post.post_type !== 'run' ? (");
    expect(styleBlock(proof, 'body')).not.toContain('minHeight');
    expect(styleBlock(proof, 'bodyLink')).toContain('minHeight: spacing.touch');
  });
  test('lets generic media use its natural height while reserving route space for runs', () => {
    expect(styleBlock(proof, 'media')).not.toContain('minHeight');
    expect(styleBlock(proof, 'runMedia')).toContain('minHeight: 220');
  });
  test('keeps actions unboxed and separates them with one hairline', () => {
    expect(styleBlock(proof, 'actions')).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
    expect(styleBlock(proof, 'action')).not.toContain('backgroundColor');
    expect(styleBlock(proof, 'action')).not.toContain('borderWidth');
    expect(styleBlock(proof, 'supporters')).not.toContain('borderTopWidth');
    expect(styleBlock(proof, 'socialActions')).toContain('gap: spacing.sm');
    expect(styleBlock(proof, 'utilityActions')).toContain('gap: spacing.sm');
  });
  test('uses an intentional unresolved-media placeholder instead of a dead blank block', () => {
    expect(postImage).toContain('testID="post-image-placeholder"');
    expect(postImage).toContain('name="image-outline"');
    expect(styleBlock(postImage, 'privatePlaceholder')).toContain("alignItems: 'center'");
    expect(styleBlock(postImage, 'privatePlaceholder')).toContain("justifyContent: 'center'");
  });
});
