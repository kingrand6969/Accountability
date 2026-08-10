begin;

delete from public.timeline_items where type in ('expense', 'income');
delete from public.posts where post_type = 'savings';
delete from public.ai_scans where kind = 'receipt';

alter table public.timeline_items drop constraint if exists timeline_items_type_check;
alter table public.timeline_items add constraint timeline_items_type_check
  check (type in ('event', 'task', 'workout', 'meal', 'activity', 'grocery', 'other'));

alter table public.posts drop constraint if exists posts_post_type_check;
alter table public.posts add constraint posts_post_type_check
  check (post_type in ('post', 'photo', 'video', 'run', 'workout', 'milestone', 'event', 'memory'));

alter table public.ai_scans drop constraint if exists ai_scans_kind_check;
alter table public.ai_scans add constraint ai_scans_kind_check check (kind = 'food');

create or replace function public.my_scan_quota()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'limit', 20,
    'food_used', (
      select count(*) from public.ai_scans
      where user_id = auth.uid() and kind = 'food'
        and created_at >= date_trunc('month', now())
    )
  );
$$;

revoke all on function public.my_scan_quota() from public;
grant execute on function public.my_scan_quota() to authenticated;

create or replace function public.my_metric_counts()
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'workouts',   (select count(*) from public.timeline_items where user_id = auth.uid() and type = 'workout'),
    'challenges', (select count(*) from public.challenge_participants where user_id = auth.uid()),
    'memories',   (select count(*) from public.memories where user_id = auth.uid()),
    'places',     (select count(*) from public.memories where user_id = auth.uid() and location is not null),
    'posts',      (select count(*) from public.posts where user_id = auth.uid()),
    'likes',      (select count(*) from public.post_likes where user_id = auth.uid()),
    'groups',     (select count(*) from public.group_members where user_id = auth.uid()),
    'messages',   (select count(*) from public.buddy_messages where sender = auth.uid()),
    'profile_fields', (
      select (avatar_url is not null and length(trim(avatar_url)) > 0)::int
           + (bio is not null and length(trim(bio)) > 0)::int
           + (display_name is not null and length(trim(display_name)) > 0)::int
      from public.profiles where id = auth.uid()
    )
  );
$$;

revoke all on function public.my_metric_counts() from public;
grant execute on function public.my_metric_counts() to authenticated;

drop trigger if exists money_tx_mirror on public.money_transactions;

drop function if exists public.biz_dashboard(uuid, date, date);
drop function if exists public.biz_items_costed(uuid);
drop function if exists public.biz_item_unit_cost(uuid, int);
drop function if exists public.income_trend(int);
drop function if exists public.mark_bill_paid_atomic(uuid, numeric, uuid);
drop function if exists public.mirror_money_tx();
drop function if exists public.pay_card_atomic(uuid, numeric, uuid);

drop table if exists public.shared_goal_contributions;
drop table if exists public.shared_goal_members;
drop table if exists public.shared_goals;
drop function if exists public.is_goal_member(uuid, uuid);
drop function if exists public.shared_goal_creator_join();

drop table if exists public.biz_payment;
drop table if exists public.biz_recipe_line;
drop table if exists public.biz_cost;
drop table if exists public.biz_loss;
drop table if exists public.biz_fixed_cost;
drop table if exists public.biz_sale;
drop table if exists public.biz_tenant;
drop table if exists public.biz_customer;
drop table if exists public.biz_item;
drop table if exists public.biz_supply;
drop table if exists public.biz_business;

drop table if exists public.debt_payments;
drop table if exists public.debts;
drop table if exists public.money_transactions;
drop table if exists public.bills;
drop table if exists public.accounts;
drop table if exists public.savings_goals;

commit;
