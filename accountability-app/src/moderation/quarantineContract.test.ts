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

beforeEach(() => rpc.mockReset().mockResolvedValue({ data: null, error: null }));

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

describe('manual-report database contract', () => {
  test('adds nullable structured columns without excluding legacy reports', () => {
    expect(migration).toMatch(/buddy_reports[\s\S]*source_table text[\s\S]*source_id uuid/i);
    expect(migration).toMatch(/source_table is null and source_id is null/i);
    expect(migration).toMatch(/source_table in \('posts', 'post_comments', 'stories'\)/i);
  });

  test('derives identities server-side and queues a priority manual check', () => {
    expect(migration).toMatch(/create or replace function public\.report_content\(\s*p_source_table text,\s*p_source_id uuid,\s*p_reason text/i);
    expect(migration).toMatch(/v_reporter_id uuid := auth\.uid\(\)/i);
    expect(migration).toMatch(/insert into public\.buddy_reports[\s\S]*v_reporter_id[\s\S]*v_author_id/i);
    expect(migration).toMatch(/jsonb_build_object\([\s\S]*'table', p_source_table[\s\S]*'id', p_source_id[\s\S]*'reason', 'manual_report'[\s\S]*'report_id', v_report_id/i);
    expect(migration).toMatch(/body := jsonb_build_object/i);
  });

  test('is authenticated-only, fail-open, and never quarantines by itself', () => {
    expect(migration).toMatch(/revoke all on function public\.report_content\(text, uuid, text\) from public, anon/i);
    expect(migration).toMatch(/grant execute on function public\.report_content\(text, uuid, text\) to authenticated, service_role/i);
    expect(migration).toMatch(/exception when others then[\s\S]*return v_report_id/i);
    const reportFunction = migration.match(/create or replace function public\.report_content[\s\S]*?\$function\$;/i)?.[0] ?? '';
    expect(reportFunction).not.toMatch(/update public\.(posts|post_comments|stories).*moderation_state/i);
  });
});
