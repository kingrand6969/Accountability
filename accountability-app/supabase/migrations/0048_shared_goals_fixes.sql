-- Shared goals fixes:
--  1. INSERT ... RETURNING must satisfy the SELECT policy, but the creator has
--     no member row yet at creation time — let creators always see their goals.
--  2. Auto-add the creator as a member on goal creation (trigger, like groups),
--     so the client never has to self-insert membership.

drop policy if exists sg_select on public.shared_goals;
create policy sg_select on public.shared_goals
  for select using (
    creator_id = auth.uid() or public.is_goal_member(id, auth.uid())
  );

create or replace function public.shared_goal_creator_join() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.shared_goal_members (goal_id, user_id)
  values (new.id, new.creator_id)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_shared_goal_creator on public.shared_goals;
create trigger trg_shared_goal_creator after insert on public.shared_goals
  for each row execute function public.shared_goal_creator_join();
