import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('buddy stars followed-feed index migration', () => {
  test('adds the index and an invoker-only bounded personal feed function', () => {
    const source = readFileSync(
      require.resolve('../../supabase/migrations/0099_buddy_stars_starrer_index.sql'),
      'utf8',
    );

    expect(source).toContain('create index if not exists buddy_stars_starrer_target_idx on public.buddy_stars (starrer, target);');
    expect(source).toMatch(/create or replace function public\.personal_feed_post_ids\(\s*p_mode text,\s*p_before timestamptz,\s*p_limit integer\s*\)\s*returns table\(id uuid\)/i);
    expect(source).toMatch(/language sql\s+stable\s+security invoker\s+set search_path = public/i);
    expect(source).not.toMatch(/security definer|execute format|\bdynamic\b/i);
    expect(source).toMatch(/where p_mode in \('buddies', 'discover'\)/i);
    expect(source).toMatch(/p\.group_id is null[\s\S]*p\.page_id is null/i);
    expect(source).toMatch(/not exists[\s\S]*post_hides[\s\S]*user_id = auth\.uid\(\)/i);
    expect(source).toMatch(/p_before is null or p\.created_at < p_before/i);
    expect(source).toMatch(/p_mode = 'buddies'[\s\S]*p\.user_id = auth\.uid\(\)[\s\S]*are_buddies\(auth\.uid\(\), p\.user_id\)[\s\S]*buddy_stars/i);
    expect(source).toMatch(/p_mode = 'discover'[\s\S]*p\.audience = 'public'[\s\S]*p\.user_id <> auth\.uid\(\)[\s\S]*not public\.are_buddies[\s\S]*not exists[\s\S]*buddy_stars/i);
    expect(source).toMatch(/order by p\.created_at desc, p\.id desc\s+limit least\(greatest\(coalesce\(p_limit, 20\), 0\), 100\)/i);
    expect(source).toMatch(/revoke execute on function public\.personal_feed_post_ids\(text, timestamptz, integer\) from public, anon/i);
    expect(source).toMatch(/grant execute on function public\.personal_feed_post_ids\(text, timestamptz, integer\) to authenticated/i);
  });
});
