-- Migración para corregir nombres de columnas de investment_operations en replace_fintrack_data
-- Corrección de transaction_id (antes linked_transaction_id) e incorporación de investment_account_id

create or replace function public.replace_fintrack_data(payload jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare
  uid uuid := auth.uid();
  inv_ops jsonb;
  default_inv_acc text;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  if jsonb_typeof(payload) <> 'object' then raise exception 'Copia no válida'; end if;
  if octet_length(payload::text) > 10485760 then raise exception 'La copia supera el tamaño máximo permitido'; end if;

  delete from public.investment_operations where user_id = uid;
  delete from public.transaction_voids where user_id = uid;
  delete from public.recurrence_exclusions where user_id = uid;
  delete from public.transactions where user_id = uid;
  delete from public.patrimony where user_id = uid;
  delete from public.budgets where user_id = uid;
  delete from public.categories where user_id = uid;
  delete from public.accounts where user_id = uid;

  insert into public.accounts(id, name, color, position, is_investment, user_id)
  select x.id, x.name, x.color, coalesce(x.position, 0), coalesce(x.is_investment, false), uid
  from jsonb_to_recordset(coalesce(payload->'accounts', '[]'::jsonb)) as x(id text, name text, color text, position integer, is_investment boolean);

  insert into public.categories(id, name, color, subcats, position, archived, kind, user_id)
  select x.id, x.name, x.color, coalesce(x.subcats, '[]'::jsonb), coalesce(x.position, 0), coalesce(x.archived, false), case when x.kind = 'income' then 'income' else 'expense' end, uid
  from jsonb_to_recordset(coalesce(payload->'categories', '[]'::jsonb)) as x(id text, name text, color text, subcats jsonb, position integer, archived boolean, kind text);

  insert into public.transactions(id, type, amount, category, subcategory, note, date, recurring, recur_interval, recur_end_date, recur_series_id, recur_anchor_date, tags, account_id, to_account_id, is_balance_adjustment, balance_adjustment_patrimony_id, user_id)
  select x.id, x.type, x.amount, x.category, x.subcategory, x.note, x.date, coalesce(x.recurring, false), x.recur_interval, x.recur_end_date, x.recur_series_id, coalesce(x.recur_anchor_date, x.date),
    case when jsonb_typeof(x.tags) = 'array' then array(select jsonb_array_elements_text(x.tags)) else array[]::text[] end,
    x.account_id, x.to_account_id, coalesce(x.is_balance_adjustment, false), x.balance_adjustment_patrimony_id, uid
  from jsonb_to_recordset(coalesce(payload->'transactions', '[]'::jsonb)) as x(id text, type text, amount numeric, category text, subcategory text, note text, date date, recurring boolean, recur_interval text, recur_end_date date, recur_series_id text, recur_anchor_date date, tags jsonb, account_id text, to_account_id text, is_balance_adjustment boolean, balance_adjustment_patrimony_id text);

  insert into public.patrimony(id, account_id, year, month, amount, theoretical_amount, reset_date, user_id)
  select x.id, x.account_id, x.year, x.month, x.amount, x.theoretical_amount, x.reset_date, uid
  from jsonb_to_recordset(coalesce(payload->'patrimony', '[]'::jsonb)) as x(id text, account_id text, year integer, month integer, amount numeric, theoretical_amount numeric, reset_date date);

  insert into public.budgets(id, category_id, amount, is_total, month_year, note, user_id)
  select x.id, x.category_id, x.amount, coalesce(x.is_total, false), x.month_year, x.note, uid
  from jsonb_to_recordset(coalesce(payload->'budgets', '[]'::jsonb)) as x(id text, category_id text, amount numeric, is_total boolean, month_year text, note text);

  insert into public.recurrence_exclusions(id, recur_series_id, skipped_date, user_id)
  select x.id, x.recur_series_id, x.skipped_date, uid
  from jsonb_to_recordset(coalesce(payload->'recurrenceExclusions', payload->'recurrence_exclusions', '[]'::jsonb)) as x(id text, recur_series_id text, skipped_date date);

  insert into public.transaction_voids(id, user_id, transaction_id, transaction_data, voided_at)
  select x.id, uid, x.transaction_id, x.transaction_data, coalesce(x.voided_at, now())
  from jsonb_to_recordset(coalesce(payload->'transactionVoids', payload->'transaction_voids', '[]'::jsonb)) as x(id text, transaction_id text, transaction_data jsonb, voided_at timestamptz);

  inv_ops := coalesce(payload->'investmentOperations', payload->'investment_operations', null);
  if inv_ops is not null and jsonb_typeof(inv_ops) = 'array' then
    select id into default_inv_acc from public.accounts where user_id = uid and is_investment limit 1;
    insert into public.investment_operations(id, symbol, product_name, product_type, side, units, unit_price, amount, operation_date, cash_account_id, investment_account_id, transaction_id, user_id)
    select x.id, x.symbol, x.product_name, x.product_type, x.side, x.units, x.unit_price, x.amount, x.operation_date, x.cash_account_id,
      coalesce(x.investment_account_id, default_inv_acc),
      coalesce(x.transaction_id, x.linked_transaction_id),
      uid
    from jsonb_to_recordset(inv_ops) as x(id text, symbol text, product_name text, product_type text, side text, units numeric, unit_price numeric, amount numeric, operation_date date, cash_account_id text, investment_account_id text, transaction_id text, linked_transaction_id text);
  end if;
end;
$$;
