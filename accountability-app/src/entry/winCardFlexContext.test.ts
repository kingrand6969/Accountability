import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Win Card Flex context integration', () => {
  test('uses the strict Flex parser for achievement identity and display copy', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/win-card.tsx'), 'utf8');

    expect(source).toContain("import { parseFlexContext");
    expect(source).toContain('parseFlexContext(params)');
    expect(source).toContain('flexContext.sourceId');
    expect(source).toContain('flexContext.title');
    expect(source).toContain('flexContext.body');
    expect(source).not.toContain('sanitizeProofParam(params.achievementSourceId)');
  });

  test('journals before upload and crosses the ambiguous dispatch boundary only at the post RPC', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/win-card.tsx'), 'utf8');
    const journal = source.indexOf("journalDurableAction(token, 'post-feed'");
    const dispatched = source.indexOf('dispatched = true', journal);
    const upload = source.indexOf('uploadPostImage(', journal);
    const ownerCheckAfterUpload = source.indexOf('requireCurrentActionOwner(token)', upload);
    const publish = source.indexOf('publishFlexFeedPost(', journal);

    expect(journal).toBeGreaterThan(0);
    expect(upload).toBeGreaterThan(journal);
    expect(ownerCheckAfterUpload).toBeGreaterThan(upload);
    expect(dispatched).toBeGreaterThan(ownerCheckAfterUpload);
    expect(publish).toBeGreaterThan(dispatched);
    expect(source).toContain("uploadPostImage(base64, 'png', pending.operationId, expectedOwnerId)");
    expect(source).toContain('operationId: pending.operationId');
    expect(source).toContain('mediaSha256: pending.match.imageSha256');
    expect(source).toContain('expectedOwnerId');
  });

  test.each([
    ['upload rejection', 'uploadPostImage('],
    ['account switch after upload', 'requireCurrentActionOwner(token)'],
  ])('keeps %s before the ambiguity boundary so the journal is cleared and retry remains available', (_case, marker) => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/win-card.tsx'), 'utf8');
    const journal = source.indexOf("journalDurableAction(token, 'post-feed'");
    const upload = source.indexOf('uploadPostImage(', journal);
    const position = marker === 'uploadPostImage('
      ? upload
      : source.indexOf(marker, upload);
    const dispatched = source.indexOf('dispatched = true', journal);

    expect(position).toBeGreaterThan(journal);
    expect(position).toBeLessThan(dispatched);
  });

  test('clears pre-dispatch journal failures but retains failures once the post RPC is invoked', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/win-card.tsx'), 'utf8');
    const journal = source.indexOf("journalDurableAction(token, 'post-feed'");
    const dispatched = source.indexOf('dispatched = true', journal);
    const publish = source.indexOf('publishFlexFeedPost(', journal);
    const ambiguous = source.indexOf('if (pending && dispatched)');
    const retained = source.indexOf('retainAmbiguous(token, pending', ambiguous);
    const preDispatch = source.indexOf('if (pending) {', retained);
    const cleared = source.indexOf('confirmDurableAction(pending)', preDispatch);

    expect(publish).toBeGreaterThan(dispatched);
    expect(ambiguous).toBeGreaterThan(0);
    expect(retained).toBeGreaterThan(ambiguous);
    expect(preDispatch).toBeGreaterThan(retained);
    expect(cleared).toBeGreaterThan(preDispatch);
  });
});
