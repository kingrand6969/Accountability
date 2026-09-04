import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

const proof = readFileSync(require.resolve('./FeedProofCard'), 'utf8');
const postImage = readFileSync(require.resolve('./PostImage'), 'utf8');

function styleBlock(source: string, name: string): string {
  return source.match(new RegExp(`${name}:\\s*\\{([\\s\\S]*?)\\n  \\},`))?.[1] ?? '';
}

describe('Editorial Motion post canvas', () => {
  test('places generic media before its caption while text-only posts remain natural height', () => {
    expect(proof.indexOf('testID="feed-post-media"')).toBeLessThan(proof.indexOf('testID="feed-post-body"'));
    expect(proof).toContain('{post.image_url ? (');
    expect(proof).toContain("{post.body && post.post_type !== 'run' ? (");
    expect(styleBlock(proof, 'body')).not.toContain('minHeight');
  });
  test('keeps actions unboxed and separates them with one hairline', () => {
    expect(styleBlock(proof, 'actions')).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
    expect(styleBlock(proof, 'action')).not.toContain('backgroundColor');
    expect(styleBlock(proof, 'action')).not.toContain('borderWidth');
  });
  test('uses an intentional unresolved-media placeholder instead of a dead blank block', () => {
    expect(postImage).toContain('testID="post-image-placeholder"');
    expect(postImage).toContain('name="image-outline"');
    expect(styleBlock(postImage, 'privatePlaceholder')).toContain("alignItems: 'center'");
    expect(styleBlock(postImage, 'privatePlaceholder')).toContain("justifyContent: 'center'");
  });
});
