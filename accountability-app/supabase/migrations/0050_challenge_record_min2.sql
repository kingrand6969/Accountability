-- Integrity: a challenge only produces a win/loss result with 2+ participants —
-- otherwise a Pro member could farm "Challenge wins" by creating solo
-- challenges and winning them by default.

create or replace function public.challenge_record(
  p_user uuid, p_start timestamptz, p_end timestamptz
) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_wins int := 0;
  v_losses int := 0;
  r record;
  v_my numeric;
  v_best numeric;
begin
  for r in
    select c.id, c.metric, c.starts_at, c.ends_at
    from public.challenges c
    join public.challenge_participants cp
      on cp.challenge_id = c.id and cp.user_id = p_user
    where c.ends_at <= now()
      and c.ends_at >= p_start and c.ends_at < p_end
      and (select count(*) from public.challenge_participants cpx
           where cpx.challenge_id = c.id) >= 2
  loop
    select public.compete_score(p_user, r.metric, r.starts_at, r.ends_at) into v_my;
    select max(public.compete_score(cp2.user_id, r.metric, r.starts_at, r.ends_at))
      into v_best
      from public.challenge_participants cp2
      where cp2.challenge_id = r.id;
    if coalesce(v_best, 0) <= 0 then
      continue; -- nobody scored: no result
    elsif v_my >= v_best then
      v_wins := v_wins + 1;
    else
      v_losses := v_losses + 1;
    end if;
  end loop;
  return greatest(0, v_wins - v_losses);
end;
$$;
revoke execute on function public.challenge_record(uuid, timestamptz, timestamptz) from public, anon, authenticated;
