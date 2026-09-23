-- Migration: 20260923140000_security_and_integrity_fixes.sql
-- Description: Refuerzo integral de seguridad, integridad referencial y atomicidad.

-- 1. Actualizar delete_fintrack_account para validar que no tenga operaciones de inversión asociadas
create or replace function public.delete_fintrack_account(target_id text)
returns void language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  if not exists(select 1 from public.accounts where id=target_id and user_id=uid) then
    raise exception 'Cuenta no encontrada';
  end if;
  if exists(select 1 from public.transactions where user_id=uid and (account_id=target_id or to_account_id=target_id)) then
    raise exception 'La cuenta tiene transacciones asociadas';
  end if;
  if exists(select 1 from public.investment_operations where user_id=uid and (cash_account_id=target_id or investment_account_id=target_id)) then
    raise exception 'La cuenta está vinculada a operaciones de inversión';
  end if;
  delete from public.patrimony where user_id=uid and account_id=target_id;
  delete from public.accounts where id=target_id and user_id=uid;
end $$;

-- 2. Actualizar clear_fintrack_data para incluir investment_operations
create or replace function public.clear_fintrack_data()
returns void language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  delete from public.investment_operations where user_id=uid;
  delete from public.transaction_voids where user_id=uid;
  delete from public.recurrence_exclusions where user_id=uid;
  delete from public.transactions where user_id=uid;
end $$;

-- 3. Actualizar record_investment_operation para incluir etiquetas en la transacción vinculada
create or replace function public.record_investment_operation(p_side text,p_symbol text,p_product_name text,p_product_type text,p_units numeric,p_unit_price numeric,p_amount numeric,p_operation_date date,p_cash_account_id text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); inv_id text; tx_id text; op_id text;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  if p_side not in ('buy','sell') or p_units<=0 or p_unit_price<=0 or p_amount<=0 then raise exception 'Datos de operación no válidos'; end if;
  if not exists(select 1 from public.accounts where id=p_cash_account_id and user_id=uid and not is_investment) then raise exception 'Cuenta de efectivo no válida'; end if;
  select id into inv_id from public.accounts where user_id=uid and is_investment limit 1;
  if inv_id is null then
    inv_id:='invacc_'||replace(uid::text,'-','');
    insert into public.accounts(id,name,color,position,user_id,is_investment) values(inv_id,'Inversión','#34C759',coalesce((select max(position)+1 from public.accounts where user_id=uid),0),uid,true);
  end if;
  tx_id:='txinv_'||replace(gen_random_uuid()::text,'-',''); op_id:='opinv_'||replace(gen_random_uuid()::text,'-','');
  insert into public.transactions(id,type,amount,category,subcategory,note,date,recurring,tags,account_id,to_account_id,user_id)
  values(
    tx_id,
    'transfer',
    p_amount,
    'investment',
    null,
    (case when p_side='buy' then 'Compra ' else 'Venta ' end)||p_symbol,
    p_operation_date,
    false,
    array['invest_operation', case when p_side='buy' then 'invest_buy' else 'invest_sell' end],
    case when p_side='buy' then p_cash_account_id else inv_id end,
    case when p_side='buy' then inv_id else p_cash_account_id end,
    uid
  );
  insert into public.investment_operations(id,user_id,side,symbol,product_name,product_type,units,unit_price,amount,operation_date,cash_account_id,investment_account_id,transaction_id)
  values(op_id,uid,p_side,upper(trim(p_symbol)),p_product_name,p_product_type,p_units,p_unit_price,p_amount,p_operation_date,p_cash_account_id,inv_id,tx_id);
  return jsonb_build_object('id',op_id,'transaction_id',tx_id,'investment_account_id',inv_id);
end $$;

-- 4. RPC atómica para editar operaciones de inversión sin riesgo de pérdida de datos
create or replace function public.update_fintrack_investment_operation(
  p_operation_id text,
  p_side text,
  p_symbol text,
  p_product_name text,
  p_product_type text,
  p_units numeric,
  p_unit_price numeric,
  p_amount numeric,
  p_operation_date date,
  p_cash_account_id text
)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  uid uuid:=auth.uid();
  op record;
  inv_id text;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  if p_side not in ('buy','sell') or p_units<=0 or p_unit_price<=0 or p_amount<=0 then
    raise exception 'Datos de operación no válidos';
  end if;
  select * into op from public.investment_operations where id=p_operation_id and user_id=uid;
  if op is null then raise exception 'Operación no encontrada'; end if;
  if not exists(select 1 from public.accounts where id=p_cash_account_id and user_id=uid and not is_investment) then
    raise exception 'Cuenta de efectivo no válida';
  end if;

  inv_id := op.investment_account_id;

  -- Actualizar la transacción vinculada
  update public.transactions set
    amount = p_amount,
    date = p_operation_date,
    note = (case when p_side='buy' then 'Compra ' else 'Venta ' end)||p_symbol,
    account_id = case when p_side='buy' then p_cash_account_id else inv_id end,
    to_account_id = case when p_side='buy' then inv_id else p_cash_account_id end,
    tags = array['invest_operation', case when p_side='buy' then 'invest_buy' else 'invest_sell' end]
  where id = op.transaction_id and user_id = uid;

  -- Actualizar la operación
  update public.investment_operations set
    side = p_side,
    symbol = upper(trim(p_symbol)),
    product_name = p_product_name,
    product_type = p_product_type,
    units = p_units,
    unit_price = p_unit_price,
    amount = p_amount,
    operation_date = p_operation_date,
    cash_account_id = p_cash_account_id
  where id = p_operation_id and user_id = uid;

  return jsonb_build_object('id', p_operation_id, 'transaction_id', op.transaction_id);
end $$;
grant execute on function public.update_fintrack_investment_operation(text,text,text,text,text,numeric,numeric,numeric,date,text) to authenticated;

-- 5. Índices de rendimiento para consultas frecuentes de saldo, categorías y cuentas
create index if not exists transactions_user_account_idx on public.transactions (user_id, account_id);
create index if not exists transactions_user_to_account_idx on public.transactions (user_id, to_account_id);
create index if not exists transactions_user_category_idx on public.transactions (user_id, category);
create index if not exists investment_ops_user_account_idx on public.investment_operations (user_id, investment_account_id);
create unique index if not exists monthly_report_runs_user_month_uniq on public.monthly_report_runs (user_id, report_month);
