import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0116_atomic_post_visibility.sql'),
  'utf8',
);

type LinkedAnnouncement = Readonly<{
  ownerMatches: boolean;
  personal: boolean;
  visible: boolean;
  postType: 'event' | 'post';
  audience: 'buddies' | 'public';
  showOnCard: boolean;
}>;

function expectedGroupPrivacy(rows: readonly LinkedAnnouncement[]): 'public' | 'private' {
  return rows.some((row) => row.ownerMatches
    && row.personal
    && row.visible
    && row.postType === 'event'
    && row.audience === 'public'
    && row.showOnCard)
    ? 'public'
    : 'private';
}

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
    expect(sql).toMatch(/update public\.groups g[\s\S]*set privacy = case[\s\S]*when exists \(/i);
    expect(sql).toMatch(/e_linked\.group_id = v_event_group_id/i);
    expect(sql).toMatch(/e_linked\.created_by = p_expected_owner/i);
    expect(sql).toMatch(/p_linked\.event_id = e_linked\.id/i);
    expect(sql).toMatch(/p_linked\.user_id = p_expected_owner/i);
    expect(sql).toMatch(/p_linked\.group_id is null[\s\S]*p_linked\.page_id is null/i);
    expect(sql).toMatch(/p_linked\.post_type = 'event'/i);
    expect(sql).toMatch(/p_linked\.moderation_state = 'visible'/i);
    expect(sql).toMatch(/p_linked\.audience = 'public'[\s\S]*p_linked\.show_on_card = true/i);
    expect(sql).toMatch(/then 'public'[\s\S]*else 'private'/i);
    expect(sql).not.toMatch(/set privacy = case when p_show_publicly/i);
  });

  test('derives group privacy across every valid linked announcement', () => {
    const publicEvent: LinkedAnnouncement = {
      ownerMatches: true,
      personal: true,
      visible: true,
      postType: 'event',
      audience: 'public',
      showOnCard: true,
    };
    const buddiesEvent: LinkedAnnouncement = {
      ...publicEvent,
      audience: 'buddies',
      showOnCard: false,
    };

    expect(expectedGroupPrivacy([buddiesEvent, publicEvent])).toBe('public');
    expect(expectedGroupPrivacy([buddiesEvent, buddiesEvent])).toBe('private');
    expect(expectedGroupPrivacy([
      buddiesEvent,
      { ...publicEvent, ownerMatches: false },
      { ...publicEvent, visible: false },
      { ...publicEvent, personal: false },
    ])).toBe('private');
  });

  test('locks the group before updating and recomputing to serialize concurrent toggles', () => {
    const groupLock = sql.search(/for update of g/i);
    const postUpdate = sql.search(/update public\.posts[\s\S]*set audience/i);
    const groupUpdate = sql.search(/update public\.groups g[\s\S]*set privacy/i);
    expect(groupLock).toBeGreaterThan(0);
    expect(postUpdate).toBeGreaterThan(groupLock);
    expect(groupUpdate).toBeGreaterThan(postUpdate);
    expect(sql).toMatch(/for update of g/i);
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
