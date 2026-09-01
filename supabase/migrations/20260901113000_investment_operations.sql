alter table public.accounts add column if not exists is_investment boolean not null default false;

create table if not exists public.investment_operations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  side text not null check (side in ('buy','sell')),
  symbol text not null,
  product_name text not null,
  product_type text,
  units numeric not null check (units > 0),
  unit_price numeric not null check (unit_price > 0),
  amount numeric not null check (amount > 0),
  operation_date date not null,
  cash_account_id text not null,
  investment_account_id text not null,
  transaction_id text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists investment_operations_user_date_idx on public.investment_operations(user_id, operation_date desc);
alter table public.investment_operations enable row level security;
revoke all on table public.investment_operations from anon;
grant select, insert, update, delete on table public.investment_operations to authenticated;
create policy "investment operations own data" on public.investment_operations for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

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
  values(tx_id,'transfer',p_amount,'investment',null,(case when p_side='buy' then 'Compra ' else 'Venta ' end)||p_symbol,p_operation_date,false,'{}',case when p_side='buy' then p_cash_account_id else inv_id end,case when p_side='buy' then inv_id else p_cash_account_id end,uid);
  insert into public.investment_operations(id,user_id,side,symbol,product_name,product_type,units,unit_price,amount,operation_date,cash_account_id,investment_account_id,transaction_id)
  values(op_id,uid,p_side,upper(trim(p_symbol)),p_product_name,p_product_type,p_units,p_unit_price,p_amount,p_operation_date,p_cash_account_id,inv_id,tx_id);
  return jsonb_build_object('id',op_id,'transaction_id',tx_id,'investment_account_id',inv_id);
end $$;
grant execute on function public.record_investment_operation(text,text,text,text,numeric,numeric,numeric,date,text) to authenticated;
