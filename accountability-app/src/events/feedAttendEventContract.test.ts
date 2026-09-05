import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const feed = readFileSync(resolve(process.cwd(), 'src/app/(app)/index.tsx'), 'utf8');

describe('Feed event attendance contract', () => {
  test('passes the immutable event and post owner rather than trusting the group id', () => {
    expect(feed).toContain('await attendEvent(eventId, expectedOwner)');
    expect(feed).not.toContain('await attendEvent(post.event.group_id)');
  });

  test('rejects a stale same-tick account or Feed row before starting attendance', () => {
    expect(feed).toMatch(
      /const requestedViewer = myId;[\s\S]*?const eventId = post\.event\.id;[\s\S]*?const expectedOwner = post\.user_id;/,
    );
    expect(feed).toMatch(
      /if\s*\(\s*!requestedViewer[\s\S]*?currentUserIdRef\.current !== requestedViewer[\s\S]*?!feedRowsBelongToView\(dataOwnerIdRef\.current, requestedViewer\)[\s\S]*?return/,
    );
  });

  test('does not publish stale success or error UI after logout or account switch', () => {
    expect(feed).toContain('const attendanceIdentity = useMemo(() => ({ ownerId: myId }), [myId])');
    expect(feed).toContain('const attendanceIdentityRef = useRef(attendanceIdentity)');
    expect(feed).toContain('const requestedIdentity = attendanceIdentity');
    expect(feed).toMatch(
      /await attendEvent\(eventId, expectedOwner\);[\s\S]*?currentUserIdRef\.current !== requestedViewer[\s\S]*?attendanceIdentityRef\.current !== requestedIdentity[\s\S]*?return;[\s\S]*?showToast/,
    );
    expect(feed).toMatch(
      /catch \(error\) \{[\s\S]*?currentUserIdRef\.current !== requestedViewer[\s\S]*?attendanceIdentityRef\.current !== requestedIdentity[\s\S]*?return;/,
    );
  });
});
