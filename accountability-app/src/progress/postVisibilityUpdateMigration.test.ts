import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0116_atomic_post_visibility.sql'),
  'utf8',
);

describe('atomic post visibility migration', () => {
  test('defines one owner-bound personal-post RPC with hardened execution', () => {
    expect(sql).toMatch(/^begin;/i);
    expect(sql).toMatch(/set local lock_timeout/i);
    expect(sql).toMatch(/set local statement_timeout/i);
    expect(sql).toMatch(
      /create or replace function public\.set_personal_post_visibility\(\s*p_expected_owner uuid,\s*p_post_id uuid,\s*p_show_publicly boolean\s*\)/i,
    );
    expect(sql).toMatch(/language plpgsql[\s\S]*security definer[\s\S]*set search_path = ''/i);
    expect(sql).toMatch(/auth\.uid\(\) <> p_expected_owner/i);
    expect(sql).toMatch(/p\.user_id = p_expected_owner/i);
    expect(sql).toMatch(/p\.group_id is null[\s\S]*p\.page_id is null/i);
    expect(sql).toMatch(/p\.moderation_state = 'visible'/i);
    expect(sql).toMatch(/for update of p/i);
  });

  test('updates the post and exact linked auto-event group in one transaction', () => {
    expect(sql).toMatch(/update public\.posts[\s\S]*audience = case when p_show_publicly then 'public' else 'buddies' end/i);
    expect(sql).toMatch(/show_on_card = p_show_publicly/i);
    expect(sql).toMatch(/e\.id = v_event_id[\s\S]*e\.created_by = p_expected_owner/i);
    expect(sql).toMatch(/g\.id = e\.group_id[\s\S]*g\.created_by = p_expected_owner/i);
    expect(sql).toMatch(
      /g\.description like 'Event group · % — auto-created when the event was announced\.'/i,
    );
    expect(sql).toMatch(/set privacy = case when p_show_publicly then 'public' else 'private' end/i);
  });

  test('rejects missing, quarantined, non-owner, non-personal, and malformed event linkage', () => {
    expect(sql).toMatch(/if not found then[\s\S]*raise exception 'Post visibility could not be updated\.'/i);
    expect(sql.match(/raise exception 'Post visibility could not be updated\.'/gi)?.length)
      .toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/if v_post_type = 'event' then[\s\S]*if v_event_id is null then/i);
    expect(sql).toMatch(/if v_event_group_id is null then[\s\S]*raise exception/i);
  });

  test('returns the exact updated state and grants authenticated callers only', () => {
    expect(sql).toMatch(/returns table\(\s*result_post_id uuid,\s*result_audience text,\s*result_show_on_card boolean\s*\)/i);
    expect(sql).toMatch(/return query select p_post_id, v_audience, p_show_publicly/i);
    expect(sql).toMatch(/revoke all on function public\.set_personal_post_visibility\(uuid, uuid, boolean\)[\s\S]*from public, anon, authenticated, service_role/i);
    expect(sql).toMatch(/grant execute on function public\.set_personal_post_visibility\(uuid, uuid, boolean\)[\s\S]*to authenticated/i);
    expect(sql).not.toMatch(/grant execute[\s\S]*to anon/i);
    expect(sql).toMatch(/commit;\s*$/i);
  });
});
