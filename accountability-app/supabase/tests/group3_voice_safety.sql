-- Group 3 voice-safety RLS harness. Run only against the linked disposable
-- staging project. Fixed opaque IDs keep output free of voice refs and secrets.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temporary table tap_output (line text) on commit drop;
grant insert on tap_output to authenticated;
insert into tap_output select plan(13);

insert into auth.users (id, aud, role, email)
values
  ('31000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'g3-owner@example.invalid'),
  ('31000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'g3-sender@example.invalid'),
  ('31000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'g3-other@example.invalid');

-- The canonical auth trigger creates profiles for exactly these new users.
update public.profiles
set display_name = case id
  when '31000000-0000-0000-0000-000000000001' then 'G3 owner'
  when '31000000-0000-0000-0000-000000000002' then 'G3 sender'
  else 'G3 other'
end
where id in (
  '31000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000002',
  '31000000-0000-0000-0000-000000000003'
);

insert into public.posts (id, user_id, body, audience)
values (
  '31000000-0000-0000-0000-000000000010',
  '31000000-0000-0000-0000-000000000001',
  'Group 3 disposable voice safety fixture',
  'public'
);

insert into public.post_encouragements
  (id, post_id, user_id, body, duration_ms)
values (
  '31000000-0000-0000-0000-000000000020',
  '31000000-0000-0000-0000-000000000010',
  '31000000-0000-0000-0000-000000000002',
  'Disposable voice-row metadata',
  null
);

insert into tap_output
select has_table('public', 'buddy_reports', 'canonical buddy_reports table exists');
insert into tap_output
select has_table('public', 'buddy_blocks', 'canonical buddy_blocks table exists');

-- Canonical buddy tables intentionally enforce only reporter/blocker auth
-- ownership. They support global user safety and do not know voice recipients.
-- Voice target readability, self rejection and post-recipient binding are
-- application/API invariants covered by src/feed/voiceSafety.test.ts.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000003', true);

insert into tap_output
select results_eq(
  $$delete from public.post_encouragements
      where id = '31000000-0000-0000-0000-000000000020'
      returning id$$,
  $$values (null::uuid) limit 0$$,
  'a different user cannot delete the sender voice row'
);

insert into tap_output
select throws_ok(
  $$insert into public.buddy_reports (reporter, reported, reason)
      values (
        '31000000-0000-0000-0000-000000000001',
        '31000000-0000-0000-0000-000000000002',
        'forged reporter'
      )$$,
  '42501',
  'new row violates row-level security policy for table "buddy_reports"',
  'another account cannot forge the recipient reporter identity'
);

insert into tap_output
select throws_ok(
  $$insert into public.buddy_blocks (blocker, blocked)
      values (
        '31000000-0000-0000-0000-000000000001',
        '31000000-0000-0000-0000-000000000002'
      )$$,
  '42501',
  'new row violates row-level security policy for table "buddy_blocks"',
  'another account cannot forge the recipient blocker identity'
);

select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);

insert into tap_output
select lives_ok(
  $$insert into public.buddy_reports (reporter, reported, reason)
      values (
        '31000000-0000-0000-0000-000000000001',
        '31000000-0000-0000-0000-000000000002',
        'voice encouragement 31000000-0000-0000-0000-000000000020'
      )$$,
  'the recipient can report the sender through canonical buddy_reports'
);

-- Reports are moderation events, not an idempotent state toggle. A repeated
-- confirmed report intentionally creates a second auditable event.
insert into tap_output
select lives_ok(
  $$insert into public.buddy_reports (reporter, reported, reason)
      values (
        '31000000-0000-0000-0000-000000000001',
        '31000000-0000-0000-0000-000000000002',
        'repeated voice encouragement report'
      )$$,
  'a repeated report remains a separate moderation event'
);

insert into tap_output
select lives_ok(
  $$insert into public.buddy_blocks (blocker, blocked)
      values (
        '31000000-0000-0000-0000-000000000001',
        '31000000-0000-0000-0000-000000000002'
      )$$,
  'the recipient can block the sender through canonical buddy_blocks'
);

-- Block is an idempotent state. The API treats this canonical primary-key
-- 23505 as success; the database must retain exactly one row.
insert into tap_output
select throws_ok(
  $$insert into public.buddy_blocks (blocker, blocked)
      values (
        '31000000-0000-0000-0000-000000000001',
        '31000000-0000-0000-0000-000000000002'
      )$$,
  '23505',
  'duplicate key value violates unique constraint "buddy_blocks_pkey"',
  'a duplicate block is rejected by the canonical primary key'
);

select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000002', true);

insert into tap_output
select results_eq(
  $$delete from public.post_encouragements
      where id = '31000000-0000-0000-0000-000000000020'
      returning id$$,
  $$values ('31000000-0000-0000-0000-000000000020'::uuid)$$,
  'the sender can delete their own voice row'
);

reset role;

insert into tap_output
select is(
  (select count(*) from public.post_encouragements
    where id = '31000000-0000-0000-0000-000000000020'),
  0::bigint,
  'sender deletion removed exactly the intended row'
);

insert into tap_output
select is(
  (select count(*) from public.buddy_reports
    where reporter = '31000000-0000-0000-0000-000000000001'
      and reported = '31000000-0000-0000-0000-000000000002'),
  2::bigint,
  'repeated reports remain two explicit moderation events'
);

insert into tap_output
select is(
  (select count(*) from public.buddy_blocks
    where blocker = '31000000-0000-0000-0000-000000000001'
      and blocked = '31000000-0000-0000-0000-000000000002'),
  1::bigint,
  'duplicate block attempts retain exactly one canonical block'
);

insert into tap_output select * from finish();
select line from tap_output;
rollback;
