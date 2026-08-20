-- Disposable pgTAP harness for the Buddy Card block read boundaries.
-- Run only against a linked disposable staging project.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temporary table tap_output (line text) on commit drop;
grant insert on tap_output to authenticated;
insert into tap_output select plan(9);

insert into auth.users (id, aud, role, email)
values
  ('32000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'privacy-viewer@example.invalid'),
  ('32000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'privacy-target@example.invalid');

update public.profiles
set
  display_name = case id
    when '32000000-0000-0000-0000-000000000001' then 'Privacy viewer'
    else 'Privacy target'
  end,
  buddy_card = coalesce(buddy_card, '{}'::jsonb) || jsonb_build_object(
    'show_consistency', true,
    'show_points', true,
    'show_distance', true,
    'show_challenge_wins', true
  )
where id in (
  '32000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000002'
);

insert into public.buddy_blocks (blocker, blocked)
values (
  '32000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000001', true);

insert into tap_output
select results_eq(
  $$select count(*) from public.public_profiles where id = '32000000-0000-0000-0000-000000000001'::uuid$$,
  $$values (1::bigint)$$,
  'self public-profile access remains available'
);

insert into tap_output
select results_eq(
  $$select count(*) from public.public_profiles where id = '32000000-0000-0000-0000-000000000002'::uuid$$,
  $$values (0::bigint)$$,
  'the blocker cannot read the blocked public profile'
);

insert into tap_output
select results_eq(
  $$select count(*) from public.member_card_stats('32000000-0000-0000-0000-000000000001'::uuid)$$,
  $$values (1::bigint)$$,
  'self member-card metrics remain available'
);

insert into tap_output
select results_eq(
  $$select count(*) from public.member_card_stats('32000000-0000-0000-0000-000000000002'::uuid)$$,
  $$values (0::bigint)$$,
  'the blocker cannot read blocked member-card metrics'
);

select set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000002', true);

insert into tap_output
select results_eq(
  $$select count(*) from public.public_profiles where id = '32000000-0000-0000-0000-000000000001'::uuid$$,
  $$values (0::bigint)$$,
  'the blocked account cannot read the blocker public profile'
);

insert into tap_output
select results_eq(
  $$select count(*) from public.member_card_stats('32000000-0000-0000-0000-000000000001'::uuid)$$,
  $$values (0::bigint)$$,
  'the blocked account cannot read blocker member-card metrics'
);

reset role;

insert into tap_output
select is(
  to_regprocedure('public.buddy_card_social_context(uuid)'),
  null::regprocedure,
  'the deprecated one-argument social-context RPC is absent'
);

insert into tap_output
select is(
  to_regprocedure('public.buddy_card_social_context(uuid,uuid)'),
  null::regprocedure,
  'the deprecated two-argument social-context RPC is absent'
);

insert into tap_output
select ok(
  to_regprocedure('public.buddy_card_social_proof(uuid,uuid)') is not null,
  'the secure social-proof RPC remains installed'
);

insert into tap_output select * from finish();
select line from tap_output;
rollback;
