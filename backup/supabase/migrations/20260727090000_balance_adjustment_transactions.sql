-- Movimiento de conciliación visible: afecta a los totales, no al saldo teórico.
alter table public.categories add column if not exists archived boolean not null default false;
alter table public.transactions
  add column if not exists is_balance_adjustment boolean not null default false,
  add column if not exists balance_adjustment_patrimony_id text;

create unique index if not exists transactions_balance_adjustment_snapshot_unique
  on public.transactions (user_id, balance_adjustment_patrimony_id)
  where balance_adjustment_patrimony_id is not null;

create or replace function public.save_fintrack_balance_adjustment(snapshot jsonb, adjustment jsonb default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); saved_snapshot jsonb; saved_adjustment jsonb:=null;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  insert into public.patrimony (id,account_id,year,month,amount,theoretical_amount,reset_date,user_id)
  select x.id,x.account_id,x.year,x.month,x.amount,x.theoretical_amount,x.reset_date,uid
  from jsonb_to_record(snapshot) as x(id text,account_id text,year integer,month integer,amount numeric,theoretical_amount numeric,reset_date date)
  returning to_jsonb(patrimony.*) into saved_snapshot;
  if adjustment is not null then
    insert into public.transactions (id,type,amount,category,subcategory,note,date,recurring,recur_interval,recur_end_date,recur_series_id,recur_anchor_date,tags,account_id,to_account_id,is_balance_adjustment,balance_adjustment_patrimony_id,user_id)
    select x.id,x.type,x.amount,x.category,x.subcategory,x.note,x.date,false,null,null,null,null,coalesce(x.tags,ARRAY[]::text[]),x.account_id,null,true,x.balance_adjustment_patrimony_id,uid
    from jsonb_to_record(adjustment) as x(id text,type text,amount numeric,category text,subcategory text,note text,date date,tags text[],account_id text,balance_adjustment_patrimony_id text)
    on conflict (user_id,balance_adjustment_patrimony_id) where balance_adjustment_patrimony_id is not null
    do update set type=excluded.type,amount=excluded.amount,category=excluded.category,note=excluded.note,date=excluded.date,account_id=excluded.account_id,is_balance_adjustment=true
    returning to_jsonb(transactions.*) into saved_adjustment;
  end if;
  return jsonb_build_object('patrimony',saved_snapshot,'transaction',saved_adjustment);
end;
$$;

grant execute on function public.save_fintrack_balance_adjustment(jsonb,jsonb) to authenticated;

create or replace function public.delete_fintrack_balance_adjustment(snapshot_id text)
returns void language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  delete from public.transactions where user_id=uid and balance_adjustment_patrimony_id=snapshot_id;
  delete from public.patrimony where user_id=uid and id=snapshot_id;
end;
$$;

grant execute on function public.delete_fintrack_balance_adjustment(text) to authenticated;

-- Repara ajustes antiguos o sincronizados parcialmente. Es idempotente:
-- cada fotografía sólo puede tener un movimiento asociado.
create or replace function public.repair_fintrack_balance_adjustments()
returns setof public.transactions
language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); p record; saved public.transactions; catid text;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  insert into public.categories(id,name,color,subcats,position,archived,kind,user_id)
  values ('cat_balance_adjustment_expense','Ajuste de saldo (gasto)','#FF3B30','[]'::jsonb,9999,true,'expense',uid),('cat_balance_adjustment_income','Ajuste de saldo (ingreso)','#34C759','[]'::jsonb,10000,true,'income',uid)
  on conflict (id) do nothing;
  for p in
    select pat.* from public.patrimony pat
    where pat.user_id=uid and pat.theoretical_amount is not null
      and abs(pat.amount-pat.theoretical_amount)>0.005
      and not exists (select 1 from public.transactions t where t.user_id=uid and t.balance_adjustment_patrimony_id=pat.id)
      and not exists (select 1 from public.transaction_voids v where v.user_id=uid and (v.transaction_id='txbal_'||pat.id or v.transaction_data->>'balance_adjustment_patrimony_id'=pat.id))
  loop
    catid:=case when p.amount-p.theoretical_amount<0 then 'cat_balance_adjustment_expense' else 'cat_balance_adjustment_income' end;
    insert into public.transactions(id,type,amount,category,subcategory,note,date,recurring,tags,account_id,to_account_id,is_balance_adjustment,balance_adjustment_patrimony_id,user_id)
    values ('txbal_'||p.id,case when p.amount-p.theoretical_amount<0 then 'expense' else 'income' end,abs(p.amount-p.theoretical_amount),catid,null,'Actualización de saldo',p.reset_date,false,ARRAY[]::text[],p.account_id,null,true,p.id,uid)
    returning * into saved;
    return next saved;
  end loop;
end;
$$;

grant execute on function public.repair_fintrack_balance_adjustments() to authenticated;

-- Reparación inicial de los datos ya existentes. Se ejecuta una sola vez al
-- aplicar esta migración y conserva la fecha de cada fotografía real.
do $$
declare p record; catid text;
begin
  for p in
    select pat.* from public.patrimony pat
    where pat.theoretical_amount is not null
      and abs(pat.amount-pat.theoretical_amount)>0.005
      and not exists (select 1 from public.transactions t where t.user_id=pat.user_id and t.balance_adjustment_patrimony_id=pat.id)
      and not exists (select 1 from public.transaction_voids v where v.user_id=pat.user_id and (v.transaction_id='txbal_'||pat.id or v.transaction_data->>'balance_adjustment_patrimony_id'=pat.id))
  loop
    catid:=case when p.amount-p.theoretical_amount<0 then 'cat_balance_adjustment_expense' else 'cat_balance_adjustment_income' end;
    insert into public.categories(id,name,color,subcats,position,archived,kind,user_id)
    values (catid,case when p.amount-p.theoretical_amount<0 then 'Ajuste de saldo (gasto)' else 'Ajuste de saldo (ingreso)' end,case when p.amount-p.theoretical_amount<0 then '#FF3B30' else '#34C759' end,'[]'::jsonb,9999,true,case when p.amount-p.theoretical_amount<0 then 'expense' else 'income' end,p.user_id)
    on conflict (id) do nothing;
    insert into public.transactions(id,type,amount,category,subcategory,note,date,recurring,tags,account_id,to_account_id,is_balance_adjustment,balance_adjustment_patrimony_id,user_id)
    values ('txbal_'||p.id,case when p.amount-p.theoretical_amount<0 then 'expense' else 'income' end,abs(p.amount-p.theoretical_amount),catid,null,'Actualización de saldo',p.reset_date,false,ARRAY[]::text[],p.account_id,null,true,p.id,p.user_id)
    on conflict (id) do nothing;
  end loop;
end;
$$;

-- Las restauraciones completas mantienen el carácter de conciliación.
create or replace function public.replace_fintrack_data(payload jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  if jsonb_typeof(payload)<>'object' then raise exception 'Copia no válida'; end if;
  if octet_length(payload::text)>10485760 then raise exception 'La copia supera el tamaño máximo permitido'; end if;
  delete from public.transaction_voids where user_id=uid; delete from public.recurrence_exclusions where user_id=uid; delete from public.transactions where user_id=uid; delete from public.patrimony where user_id=uid; delete from public.budgets where user_id=uid; delete from public.categories where user_id=uid; delete from public.accounts where user_id=uid;
  insert into public.accounts(id,name,color,position,user_id) select x.id,x.name,x.color,coalesce(x.position,0),uid from jsonb_to_recordset(coalesce(payload->'accounts','[]'::jsonb)) as x(id text,name text,color text,position integer);
  insert into public.categories(id,name,color,subcats,position,archived,kind,user_id) select x.id,x.name,x.color,coalesce(x.subcats,'[]'::jsonb),coalesce(x.position,0),coalesce(x.archived,false),case when x.kind='income' then 'income' else 'expense' end,uid from jsonb_to_recordset(coalesce(payload->'categories','[]'::jsonb)) as x(id text,name text,color text,subcats jsonb,position integer,archived boolean,kind text);
  insert into public.transactions(id,type,amount,category,subcategory,note,date,recurring,recur_interval,recur_end_date,recur_series_id,recur_anchor_date,tags,account_id,to_account_id,is_balance_adjustment,balance_adjustment_patrimony_id,user_id)
  select x.id,x.type,x.amount,x.category,x.subcategory,x.note,x.date,coalesce(x.recurring,false),x.recur_interval,x.recur_end_date,x.recur_series_id,coalesce(x.recur_anchor_date,x.date),coalesce(x.tags,'[]'::jsonb),x.account_id,x.to_account_id,coalesce(x.is_balance_adjustment,false),x.balance_adjustment_patrimony_id,uid from jsonb_to_recordset(coalesce(payload->'transactions','[]'::jsonb)) as x(id text,type text,amount numeric,category text,subcategory text,note text,date date,recurring boolean,recur_interval text,recur_end_date date,recur_series_id text,recur_anchor_date date,tags jsonb,account_id text,to_account_id text,is_balance_adjustment boolean,balance_adjustment_patrimony_id text);
  insert into public.patrimony(id,account_id,year,month,amount,theoretical_amount,reset_date,user_id) select x.id,x.account_id,x.year,x.month,x.amount,x.theoretical_amount,x.reset_date,uid from jsonb_to_recordset(coalesce(payload->'patrimony','[]'::jsonb)) as x(id text,account_id text,year integer,month integer,amount numeric,theoretical_amount numeric,reset_date date);
  insert into public.budgets(id,category_id,amount,is_total,month_year,note,user_id) select x.id,x.category_id,x.amount,coalesce(x.is_total,false),x.month_year,x.note,uid from jsonb_to_recordset(coalesce(payload->'budgets','[]'::jsonb)) as x(id text,category_id text,amount numeric,is_total boolean,month_year text,note text);
  insert into public.recurrence_exclusions(id,recur_series_id,skipped_date,user_id) select x.id,x.recur_series_id,x.skipped_date,uid from jsonb_to_recordset(coalesce(payload->'recurrenceExclusions','[]'::jsonb)) as x(id text,recur_series_id text,skipped_date date);
  insert into public.transaction_voids(id,user_id,transaction_id,transaction_data,voided_at) select x.id,uid,x.transaction_id,x.transaction_data,coalesce(x.voided_at,now()) from jsonb_to_recordset(coalesce(payload->'transactionVoids','[]'::jsonb)) as x(id text,transaction_id text,transaction_data jsonb,voided_at timestamptz);
end;
$$;
