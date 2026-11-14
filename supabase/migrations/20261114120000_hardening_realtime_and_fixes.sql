-- Hardening: publish replicated tables to supabase_realtime and scope balance-adjustment categories per tenant
do $$
declare
  tbl text;
  tables text[] := array[
    'transactions',
    'categories',
    'accounts',
    'budgets',
    'patrimony',
    'recurrence_exclusions',
    'transaction_voids',
    'investment_operations'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach tbl in array tables loop
      if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = tbl)
         and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = tbl
         ) then
        execute format('alter publication supabase_realtime add table public.%I', tbl);
      end if;
    end loop;
  end if;
end $$;

create or replace function public.repair_fintrack_balance_adjustments()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  exp_cat_id text;
  inc_cat_id text;
  cat_id text;
  diff numeric;
  p record;
  repaired integer := 0;
begin
  if uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  exp_cat_id := 'cat_balance_adjustment_expense_' || replace(uid::text, '-', '');
  inc_cat_id := 'cat_balance_adjustment_income_' || replace(uid::text, '-', '');

  insert into public.categories(id, name, color, subcats, position, archived, kind, user_id)
  values
    (exp_cat_id, 'Ajuste de saldo (gasto)', '#FF3B30', '[]'::jsonb, 9999, true, 'expense', uid),
    (inc_cat_id, 'Ajuste de saldo (ingreso)', '#34C759', '[]'::jsonb, 10000, true, 'income', uid)
  on conflict (id) do nothing;

  for p in
    select pat.*
    from public.patrimony pat
    where pat.user_id = uid
      and pat.theoretical_amount is not null
      and abs(pat.amount - pat.theoretical_amount) >= 0.01
      and not exists (
        select 1 from public.transactions t
        where t.user_id = uid
          and t.balance_adjustment_patrimony_id = pat.id
      )
  loop
    diff := round((p.amount - p.theoretical_amount)::numeric, 2);
    if abs(diff) >= 0.01 then
      cat_id := case when diff < 0 then exp_cat_id else inc_cat_id end;
      insert into public.transactions(
        id, type, amount, category, subcategory, note, date,
        recurring, tags, account_id, is_balance_adjustment,
        balance_adjustment_patrimony_id, user_id
      )
      values (
        'txbal_' || p.id,
        case when diff < 0 then 'expense' else 'income' end,
        abs(diff),
        cat_id,
        '',
        'Actualización automática de saldo',
        coalesce(p.reset_date, make_date(p.year, least(12, greatest(1, coalesce(p.month, 0) + 1)), 1)),
        false,
        array[]::text[],
        p.account_id,
        true,
        p.id,
        uid
      )
      on conflict (id) do nothing;
      repaired := repaired + 1;
    end if;
  end loop;

  return repaired;
end;
$$;
