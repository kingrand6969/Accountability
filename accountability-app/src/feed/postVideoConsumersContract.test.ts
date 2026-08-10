import { describe, expect, test } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const srcRoot = join(__dirname, '..');

function source(relativePath: string) {
  return readFileSync(join(srcRoot, relativePath), 'utf8');
}

function consumerFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return consumerFiles(path);
    if (!/\.tsx$/.test(name) || /\.test\.tsx$/.test(name)) return [];
    return readFileSync(path, 'utf8').includes('<PostVideo')
      ? [relative(srcRoot, path).replaceAll('\\', '/')]
      : [];
  });
}

describe('PostVideo consumers', () => {
  test('enumerates every consumer so new call sites must choose an explicit lifecycle', () => {
    expect(consumerFiles(srcRoot).sort()).toEqual([
      'app/compose.tsx',
      'app/group/[id].tsx',
      'app/page/[id].tsx',
      'feed/FeedProofCard.tsx',
      'feed/ImmersivePost.tsx',
    ]);
  });

  test('compose gates its selected-video preview by focus, foreground, and blockers', () => {
    const compose = source('app/compose.tsx');
    expect(compose).toContain('const composeVideoActive =');
    expect(compose).toContain('screenFocused && appActive');
    expect(compose).toContain('!posting && !tagPickerOpen && !editorUri');
    expect(compose).toContain('<PostVideo url={pickedVideo.uri} active={composeVideoActive} />');
  });

  test.each(['app/group/[id].tsx', 'app/page/[id].tsx'])(
    '%s activates at most one viewable video through the shared list lifecycle',
    (file) => {
      const contents = source(file);
      expect(contents).toContain('useActiveVideoList({');
      expect(contents).toContain('onViewableItemsChanged={videoPlayback.onViewableItemsChanged}');
      expect(contents).toContain('viewabilityConfig={videoPlayback.viewabilityConfig}');
      expect(contents).toContain('active={videoPlayback.activeVideoId === row.post.id}');
    },
  );
});
