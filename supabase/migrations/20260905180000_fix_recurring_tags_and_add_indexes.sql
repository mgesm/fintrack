-- Migración para corregir el tipo de tags en create_fintrack_recurring_occurrence
-- y añadir índices compuestos para rendimiento de consultas

create or replace function public.create_fintrack_recurring_occurrence(payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public as 
declare uid uuid:=auth.uid(); result jsonb; sid text; d date;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  sid:=payload->>'recur_series_id'; d:=(payload->>'date')::date;
  if sid is null or d is null then raise exception 'Ocurrencia inválida'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text||'|'||sid||'|'||d::text,0));
  select to_jsonb(t) into result from public.transactions t where t.user_id=uid and t.recur_series_id=sid and t.date=d limit 1;
  if result is not null then return result; end if;
  insert into public.transactions(id,type,amount,category,subcategory,note,date,recurring,recur_interval,recur_end_date,recur_series_id,recur_anchor_date,tags,account_id,to_account_id,user_id)
  select x.id,x.type,x.amount,x.category,x.subcategory,x.note,x.date,true,x.recur_interval,x.recur_end_date,x.recur_series_id,coalesce(x.recur_anchor_date,x.date),
    case when jsonb_typeof(x.tags) = 'array' then array(select jsonb_array_elements_text(x.tags)) else array[]::text[] end,
    x.account_id,x.to_account_id,uid
  from jsonb_to_record(payload) as x(id text,type text,amount numeric,category text,subcategory text,note text,date date,recur_interval text,recur_end_date date,recur_series_id text,recur_anchor_date date,tags jsonb,account_id text,to_account_id text);
  select to_jsonb(t) into result from public.transactions t where t.user_id=uid and t.id=payload->>'id';
  return result;
end;
;

-- 1. Transacciones por fecha (optimiza getDashboardTx, listados y cálculo de saldos)
create index if not exists transactions_user_date_idx 
  on public.transactions (user_id, date desc);

-- 2. Transacciones recurrentes por serie y fecha
create index if not exists transactions_user_recurring_series_idx 
  on public.transactions (user_id, recur_series_id, date) 
  where recurring = true;

-- 3. Patrimonio por cuenta y fecha de corte (optimiza valoración de cuentas e histórico)
create index if not exists patrimony_user_account_reset_idx 
  on public.patrimony (user_id, account_id, reset_date desc);

-- 4. Presupuestos por mes y categoría
create index if not exists budgets_user_month_category_idx 
  on public.budgets (user_id, month_year, category_id);

-- 5. Control de ejecuciones de backups
create index if not exists backup_runs_user_status_created_idx 
  on public.backup_runs (user_id, status, created_at desc);

-- 6. Control de ejecuciones de informe mensual
create index if not exists monthly_report_runs_user_month_idx 
  on public.monthly_report_runs (user_id, report_month, status);
