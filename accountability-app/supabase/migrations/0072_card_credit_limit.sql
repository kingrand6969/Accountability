-- 0072: credit limit per card → powers available-credit + utilisation display.
alter table public.debts add column if not exists credit_limit numeric;
