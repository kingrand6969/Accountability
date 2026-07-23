-- 0068: income trend for the Finance tab (Pro feature).
--
-- Aggregates the caller's income by month IN THE DATABASE so the phone pulls 12
-- small rows instead of a year of transactions — same bandwidth discipline as
-- the rest of the finance screens.

create or replace function public.income_trend(p_months int default 12)
returns table(month date, total numeric)
language sql stable security definer set search_path = public as $$
  select date_trunc('month', t.tx_date)::date as month,
         sum(t.amount)::numeric as total
  from public.money_transactions t
  where t.user_id = auth.uid()
    and t.kind = 'income'
    and t.tx_date >= (
      date_trunc('month', current_date)
      - ((greatest(1, least(coalesce(p_months, 12), 24)) - 1) || ' months')::interval
    )::date
  group by 1
  order by 1;
$$;

grant execute on function public.income_trend(int) to authenticated;
