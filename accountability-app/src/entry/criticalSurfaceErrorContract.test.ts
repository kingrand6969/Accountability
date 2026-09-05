import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

const feed = source('src/app/(app)/index.tsx');
const post = source('src/app/(app)/post/[id].tsx');
const compose = source('src/app/compose.tsx');
const winCard = source('src/app/win-card.tsx');

describe('critical Feed and publishing error boundary', () => {
  test.each([
    ['Feed', feed, "from '../../ui/userFacingError'", 3],
    ['Post detail', post, "from '../../../ui/userFacingError'", 3],
    ['Compose', compose, "from '../ui/userFacingError'", 7],
    ['Win Card', winCard, "from '../ui/userFacingError'", 1],
  ])('%s routes backend failures through the shared allowlist', (_name, file, importSource, minimumCalls) => {
    expect(file).toContain(importSource);
    expect(file.match(/userFacingErrorMessage\(/g)?.length ?? 0).toBeGreaterThanOrEqual(minimumCalls);
  });

  test('Feed and Post load state stores only mapped copy', () => {
    expect(feed).toContain("setLoadError(userFacingErrorMessage(error, 'load'))");
    expect(post).toContain("setLoadError(userFacingErrorMessage(error, 'load'))");
  });

  test.each([
    ['Feed', feed],
    ['Post detail', post],
    ['Compose', compose],
    ['Win Card', winCard],
  ])('%s never interpolates raw caught error messages into UI', (_name, file) => {
    expect(file).not.toContain('String((error as Error).message ?? error)');
    expect(file).not.toContain('String((e as Error).message ?? e)');
    expect(file).not.toContain('String((cleanupError as Error).message ?? cleanupError)');
  });
});
