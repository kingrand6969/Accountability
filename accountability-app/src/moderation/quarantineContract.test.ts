import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { reportComment, reportPost } from '../feed/api';
import { reportStory } from '../stories/api';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, rpc: jest.fn(), from: jest.fn() },
}));
jest.mock('../profiles/publicProfiles', () => ({ getPublicProfiles: jest.fn() }));
jest.mock('../media/privateMedia', () => ({ resolveMediaUrls: jest.fn() }));
jest.mock('../feed/uploadPostImage', () => ({ uploadPostImage: jest.fn() }));
jest.mock('../lib/r2', () => ({ uploadBytesToR2: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const rpc = supabase.rpc as jest.Mock<any>;
const migration = readFileSync(
  require.resolve('../../supabase/migrations/0096_ai_moderation_quarantine.sql'),
  'utf8',
);
const postDetailSource = readFileSync(require.resolve('../app/post/[id]'), 'utf8');
const storyViewerSource = readFileSync(require.resolve('../app/story/[userId]'), 'utf8');

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
});

describe('structured content reporting clients', () => {
  test.each([
    ['posts', () => reportPost({ id: 'post-id', user_id: 'ignored', body: 'secret excerpt' }), 'post-id'],
    ['post_comments', () => reportComment('comment-id', '  bullying  '), 'comment-id'],
    ['stories', () => reportStory('story-id'), 'story-id'],
  ])('reports %s using an opaque structured RPC payload', async (table, invoke, id) => {
    await invoke();
    expect(rpc).toHaveBeenCalledWith('report_content', {
      p_source_table: table,
      p_source_id: id,
      p_reason: table === 'post_comments' ? 'bullying' : null,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('secret excerpt');
    expect(supabase.from).not.toHaveBeenCalledWith('buddy_reports');
  });

  test('propagates RPC errors', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(reportComment('comment-id')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('manual-report screen contract', () => {
  test('only offers the accessible comment report action to non-owners', () => {
    expect(postDetailSource).toMatch(/item\.user_id\s*!==\s*myId[\s\S]*accessibilityLabel="Report this comment"/);
    expect(postDetailSource).toMatch(/accessibilityRole="button"[\s\S]*>\s*<Text[^>]*>Report<\/Text>/);
  });

  test('comment reporting confirms visibility, locks duplicate submissions, and reports the exact comment', () => {
    expect(postDetailSource).toMatch(/Report comment\?[\s\S]*stays visible unless AI confirms a violation or an admin removes it/i);
    expect(postDetailSource).toMatch(/commentReportsInFlight\.current\.has\(target\.id\)[\s\S]*commentReportsInFlight\.current\.add\(target\.id\)/);
    expect(postDetailSource).toContain('await reportComment(target.id)');
    expect(postDetailSource).toMatch(/showToast\('Comment reported'\)/);
    expect(postDetailSource).toMatch(/Alert\.alert\('Could not report comment'/);
    expect(postDetailSource).toMatch(/commentReportsInFlight\.current\.delete\(target\.id\)/);
  });

  test('only offers the accessible story report action to non-owners', () => {
    expect(storyViewerSource).toMatch(/!group\.isMe[\s\S]*accessibilityLabel="Report this story"/);
    expect(storyViewerSource).toContain('accessibilityRole="button"');
  });

  test('story reporting confirms visibility, locks duplicate submissions, and reports the exact active story', () => {
    expect(storyViewerSource).toMatch(/Report story\?[\s\S]*stays visible unless AI confirms a violation or an admin removes it/i);
    expect(storyViewerSource).toMatch(/reportInFlight\.current[\s\S]*reportInFlight\.current = true/);
    expect(storyViewerSource).toContain('await reportStory(target.id)');
    expect(storyViewerSource).toMatch(/showToast\('Story reported'\)/);
    expect(storyViewerSource).toMatch(/Alert\.alert\('Could not report story'/);
    expect(storyViewerSource).toMatch(/reportInFlight\.current = false/);
  });
});

describe('manual-report database contract', () => {
  test('adds nullable structured columns without excluding legacy reports', () => {
    expect(migration).toMatch(/buddy_reports[\s\S]*source_table text[\s\S]*source_id uuid/i);
    expect(migration).toMatch(/source_table is null and source_id is null/i);
    expect(migration).toMatch(/source_table in \('posts', 'post_comments', 'stories'\)/i);
    expect(migration).toMatch(/create policy "File own reports"[\s\S]*source_table is null and source_id is null/i);
  });

  test('derives identities server-side and queues a priority manual check', () => {
    const reportFunction = migration.match(/create or replace function public\.report_content[\s\S]*?\$function\$;/i)?.[0] ?? '';
    expect(migration).toMatch(/create or replace function public\.report_content\(\s*p_source_table text,\s*p_source_id uuid,\s*p_reason text/i);
    expect(migration).toMatch(/v_reporter_id uuid := auth\.uid\(\)/i);
    expect(migration).toMatch(/insert into public\.buddy_reports[\s\S]*v_reporter_id[\s\S]*v_author_id/i);
    expect(migration).toMatch(/jsonb_build_object\([\s\S]*'table', p_source_table[\s\S]*'id', p_source_id[\s\S]*'reason', 'manual_report'[\s\S]*'report_id', p_report_id/i);
    expect(migration).toMatch(/body := jsonb_build_object/i);
    expect(reportFunction).toMatch(/pg_advisory_xact_lock\(hashtextextended\('report_content:' \|\| v_reporter_id::text, 0\)\)/i);
    expect(migration).toMatch(/create unique index if not exists buddy_reports_open_structured_idx[\s\S]*where source_table is not null and resolved_at is null/i);
    expect(reportFunction).toMatch(/on conflict \(reporter, source_table, source_id\)[\s\S]*where source_table is not null and resolved_at is null[\s\S]*do nothing/i);
    const limiterFunction = migration.match(/create or replace function public\.enforce_rate_limit[\s\S]*?\$function\$;/i)?.[0] ?? '';
    expect(limiterFunction).toMatch(/if tg_table_name = 'buddy_reports'[\s\S]*pg_advisory_xact_lock\([\s\S]*hashtextextended\('report_content:' \|\| new\.reporter::text, 0\)[\s\S]*select \* into cfg[\s\S]*select count\(\*\)/i);
  });

  test('is authenticated-only, fail-open, and never quarantines by itself', () => {
    const reportFunction = migration.match(/create or replace function public\.report_content[\s\S]*?\$function\$;/i)?.[0] ?? '';
    const enqueueFunction = migration.match(/create or replace function public\.enqueue_manual_moderation[\s\S]*?\$function\$;/i)?.[0] ?? '';
    expect(migration).toMatch(/revoke all on function public\.report_content\(text, uuid, text\) from public, anon/i);
    expect(migration).toMatch(/grant execute on function public\.report_content\(text, uuid, text\) to authenticated, service_role/i);
    expect(reportFunction).toMatch(/exception when others then[\s\S]*return v_report_id/i);
    expect(reportFunction).not.toMatch(/update public\.(posts|post_comments|stories).*moderation_state/i);
    expect(reportFunction).toMatch(/perform public\.enqueue_manual_moderation/i);
    expect(enqueueFunction).toMatch(/coalesce\(v_secret, ''\) <> ''/i);
    expect(enqueueFunction).toMatch(/\/functions\/v1\/moderate-content/i);
    expect(enqueueFunction).not.toMatch(/'x-moderation-secret', coalesce\(v_secret, ''\)/i);
    expect(migration).toMatch(/revoke all on function public\.enqueue_manual_moderation\(text, uuid, uuid\)\s*from public, anon, authenticated/i);
  });
});
