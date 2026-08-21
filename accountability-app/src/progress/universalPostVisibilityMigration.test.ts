import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0115_universal_post_visibility.sql'),
  'utf8',
);

const personalRepair = sql.match(/update public\.posts[\s\S]*?;/i)?.[0] ?? '';
const invariant = sql.match(
  /add constraint posts_personal_visibility_check[\s\S]*?not valid;/i,
)?.[0] ?? '';

type PostShape = Readonly<{
  groupId: string | null;
  pageId: string | null;
  audience: 'buddies' | 'public' | 'group';
  showOnCard: boolean;
}>;

function expectedRepair(row: PostShape): PostShape {
  if (row.groupId !== null || row.pageId !== null) return row;
  if (row.audience === 'public' && row.showOnCard) return row;
  return { ...row, audience: 'buddies', showOnCard: false };
}

describe('universal post visibility migration', () => {
  test('is replay-safe and repairs legacy personal rows toward privacy', () => {
    expect(sql).toMatch(/^begin;/i);
    expect(sql).toMatch(/set local lock_timeout/i);
    expect(sql).toMatch(/drop constraint if exists posts_personal_visibility_check/i);
    expect(sql).toMatch(/update public\.posts[\s\S]*audience = 'buddies'[\s\S]*show_on_card = false/i);
    expect(sql).toMatch(/audience = 'public'[\s\S]*show_on_card is true/i);
    expect(sql).toMatch(/validate constraint posts_personal_visibility_check/i);
    expect(sql).toMatch(/commit;\s*$/i);
  });

  test('allows only the two canonical states for personal posts', () => {
    expect(invariant).toMatch(/audience = 'buddies'[\s\S]*show_on_card = false/i);
    expect(invariant).toMatch(/audience = 'public'[\s\S]*show_on_card = true/i);
    expect(invariant).toMatch(/group_id is not null[\s\S]*page_id is not null/i);
    expect(invariant).not.toMatch(/audience not in/i);
  });

  test('repairs every non-canonical personal audience, including legacy group rows', () => {
    expect(personalRepair).toMatch(/group_id is null/i);
    expect(personalRepair).toMatch(/page_id is null/i);
    expect(personalRepair).toMatch(
      /not \(audience = 'public' and show_on_card is true\)/i,
    );
    expect(personalRepair).not.toMatch(/audience in \('buddies', 'public'\)/i);

    expect(expectedRepair({
      groupId: null,
      pageId: null,
      audience: 'group',
      showOnCard: true,
    })).toMatchObject({ audience: 'buddies', showOnCard: false });
    expect(expectedRepair({
      groupId: null,
      pageId: null,
      audience: 'group',
      showOnCard: false,
    })).toMatchObject({ audience: 'buddies', showOnCard: false });
  });

  test('preserves actual group and page posts', () => {
    const groupPost: PostShape = {
      groupId: 'group-1', pageId: null, audience: 'group', showOnCard: true,
    };
    const pagePost: PostShape = {
      groupId: null, pageId: 'page-1', audience: 'public', showOnCard: false,
    };
    expect(expectedRepair(groupPost)).toBe(groupPost);
    expect(expectedRepair(pagePost)).toBe(pagePost);
  });

  test('repairs only linked auto-created event groups after a privacy downgrade', () => {
    expect(sql).toMatch(/update public\.groups g[\s\S]*set privacy = 'private'/i);
    expect(sql).toMatch(/join public\.posts p on p\.event_id = e\.id/i);
    expect(sql).toMatch(/e\.group_id = g\.id/i);
    expect(sql).toMatch(/e\.created_by = p\.user_id/i);
    expect(sql).toMatch(/p\.post_type = 'event'/i);
    expect(sql).toMatch(/p\.audience = 'buddies'[\s\S]*p\.show_on_card = false/i);
    expect(sql).toMatch(
      /g\.description like 'Event group · % — auto-created when the event was announced\.'/i,
    );
    expect(sql).toMatch(/not exists \([\s\S]*p_public\.audience = 'public'[\s\S]*p_public\.show_on_card = true/i);
  });

  test('does not touch private progress tables or storage', () => {
    expect(sql).not.toMatch(/body_measurements|progress_photos|storage\.objects/i);
  });
});
