-- Importación completa y segura: incluye anulaciones y el tipo de categoría.
alter table public.transactions add column if not exists recur_anchor_date date;
update public.transactions t set recur_anchor_date=s.anchor_date
from (select user_id,recur_series_id,min(date) as anchor_date from public.transactions where recurring=true and recur_series_id is not null group by user_id,recur_series_id) s
where t.user_id=s.user_id and t.recur_series_id=s.recur_series_id and t.recur_anchor_date is null;

create or replace function public.replace_fintrack_data(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  if jsonb_typeof(payload) <> 'object' then raise exception 'Copia no válida'; end if;
  if octet_length(payload::text) > 10485760 then raise exception 'La copia supera el tamaño máximo permitido'; end if;

  -- Las anulaciones conservan una fotografía de la transacción: bórralas antes
  -- de sustituir el resto de datos para que la restauración sea un único estado.
  delete from public.transaction_voids where user_id = uid;
  delete from public.recurrence_exclusions where user_id = uid;
  delete from public.transactions where user_id = uid;
  delete from public.patrimony where user_id = uid;
  delete from public.budgets where user_id = uid;
  delete from public.categories where user_id = uid;
  delete from public.accounts where user_id = uid;

  insert into public.accounts (id,name,color,position,user_id)
  select x.id,x.name,x.color,coalesce(x.position,0),uid
  from jsonb_to_recordset(coalesce(payload->'accounts','[]'::jsonb)) as x(id text,name text,color text,position integer);

  insert into public.categories (id,name,color,subcats,position,archived,kind,user_id)
  select x.id,x.name,x.color,coalesce(x.subcats,'[]'::jsonb),coalesce(x.position,0),coalesce(x.archived,false),
    case when x.kind = 'income' then 'income' else 'expense' end,uid
  from jsonb_to_recordset(coalesce(payload->'categories','[]'::jsonb)) as x(id text,name text,color text,subcats jsonb,position integer,archived boolean,kind text);

  insert into public.transactions (id,type,amount,category,subcategory,note,date,recurring,recur_interval,recur_end_date,recur_series_id,recur_anchor_date,tags,account_id,to_account_id,user_id)
  select x.id,x.type,x.amount,x.category,x.subcategory,x.note,x.date,coalesce(x.recurring,false),x.recur_interval,x.recur_end_date,x.recur_series_id,coalesce(x.recur_anchor_date,x.date),coalesce(x.tags,'[]'::jsonb),x.account_id,x.to_account_id,uid
  from jsonb_to_recordset(coalesce(payload->'transactions','[]'::jsonb)) as x(id text,type text,amount numeric,category text,subcategory text,note text,date date,recurring boolean,recur_interval text,recur_end_date date,recur_series_id text,recur_anchor_date date,tags jsonb,account_id text,to_account_id text);

  insert into public.patrimony (id,account_id,year,month,amount,theoretical_amount,reset_date,user_id)
  select x.id,x.account_id,x.year,x.month,x.amount,x.theoretical_amount,x.reset_date,uid
  from jsonb_to_recordset(coalesce(payload->'patrimony','[]'::jsonb)) as x(id text,account_id text,year integer,month integer,amount numeric,theoretical_amount numeric,reset_date date);

  insert into public.budgets (id,category_id,amount,is_total,month_year,note,user_id)
  select x.id,x.category_id,x.amount,coalesce(x.is_total,false),x.month_year,x.note,uid
  from jsonb_to_recordset(coalesce(payload->'budgets','[]'::jsonb)) as x(id text,category_id text,amount numeric,is_total boolean,month_year text,note text);

  insert into public.recurrence_exclusions (id,recur_series_id,skipped_date,user_id)
  select x.id,x.recur_series_id,x.skipped_date,uid
  from jsonb_to_recordset(coalesce(payload->'recurrenceExclusions','[]'::jsonb)) as x(id text,recur_series_id text,skipped_date date);

  insert into public.transaction_voids (id,user_id,transaction_id,transaction_data,voided_at)
  select x.id,uid,x.transaction_id,x.transaction_data,coalesce(x.voided_at,now())
  from jsonb_to_recordset(coalesce(payload->'transactionVoids','[]'::jsonb)) as x(id text,transaction_id text,transaction_data jsonb,voided_at timestamptz);
end;
$$;

-- Elimina una ocurrencia sin romper la serie ni el saldo teórico.
create or replace function public.skip_fintrack_recurring_occurrence(target_id text, series_id text)
returns void language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); tx jsonb; skipped date;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  select to_jsonb(t),t.date into tx,skipped from public.transactions t where t.id=target_id and t.user_id=uid and t.recurring=true;
  if tx is null then raise exception 'Ocurrencia no encontrada'; end if;
  insert into public.recurrence_exclusions(id,user_id,recur_series_id,skipped_date)
  values ('rx'||extract(epoch from clock_timestamp())::bigint||substr(md5(random()::text),1,6),uid,series_id,skipped)
  on conflict do nothing;
  insert into public.transaction_voids(id,user_id,transaction_id,transaction_data)
  values ('tv'||extract(epoch from clock_timestamp())::bigint||substr(md5(random()::text),1,6),uid,target_id,tx)
  on conflict(user_id,transaction_id) do update set transaction_data=excluded.transaction_data,voided_at=now();
  delete from public.transactions where id=target_id and user_id=uid;
end;
$$;

-- Cancela una serie desde una fecha y registra todas las anulaciones de forma atómica.
create or replace function public.cancel_fintrack_recurrence_from(target_id text)
returns void language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); target public.transactions%rowtype; item public.transactions%rowtype;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  select * into target from public.transactions where id=target_id and user_id=uid and recurring=true;
  if target.id is null or target.recur_series_id is null then raise exception 'La recurrencia no tiene una serie válida'; end if;
  for item in select * from public.transactions where user_id=uid and recurring=true and recur_series_id=target.recur_series_id and date>=target.date loop
    insert into public.transaction_voids(id,user_id,transaction_id,transaction_data)
    values ('tv'||extract(epoch from clock_timestamp())::bigint||substr(md5(random()::text),1,6),uid,item.id,to_jsonb(item))
    on conflict(user_id,transaction_id) do update set transaction_data=excluded.transaction_data,voided_at=now();
  end loop;
  update public.transactions set recurring=false,recur_interval=null,recur_end_date=null,recur_series_id=null
  where user_id=uid and recurring=true and recur_series_id=target.recur_series_id and date<target.date;
  delete from public.transactions where user_id=uid and recurring=true and recur_series_id=target.recur_series_id and date>=target.date;
end;
$$;

-- Inserta ocurrencias bajo un bloqueo por usuario/serie/fecha para evitar duplicados entre dispositivos.
create or replace function public.create_fintrack_recurring_occurrence(payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); result jsonb; sid text; d date;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  sid:=payload->>'recur_series_id'; d:=(payload->>'date')::date;
  if sid is null or d is null then raise exception 'Ocurrencia inválida'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text||'|'||sid||'|'||d::text,0));
  select to_jsonb(t) into result from public.transactions t where t.user_id=uid and t.recur_series_id=sid and t.date=d limit 1;
  if result is not null then return result; end if;
  insert into public.transactions(id,type,amount,category,subcategory,note,date,recurring,recur_interval,recur_end_date,recur_series_id,recur_anchor_date,tags,account_id,to_account_id,user_id)
  select x.id,x.type,x.amount,x.category,x.subcategory,x.note,x.date,true,x.recur_interval,x.recur_end_date,x.recur_series_id,coalesce(x.recur_anchor_date,x.date),coalesce(x.tags,'[]'::jsonb),x.account_id,x.to_account_id,uid
  from jsonb_to_record(payload) as x(id text,type text,amount numeric,category text,subcategory text,note text,date date,recur_interval text,recur_end_date date,recur_series_id text,recur_anchor_date date,tags jsonb,account_id text,to_account_id text);
  select to_jsonb(t) into result from public.transactions t where t.user_id=uid and t.id=payload->>'id';
  return result;
end;
$$;

create or replace function public.clear_fintrack_data()
returns void language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  delete from public.transaction_voids where user_id=uid;
  delete from public.recurrence_exclusions where user_id=uid;
  delete from public.transactions where user_id=uid;
end; $$;

grant execute on function public.replace_fintrack_data(jsonb),public.skip_fintrack_recurring_occurrence(text,text),public.cancel_fintrack_recurrence_from(text),public.create_fintrack_recurring_occurrence(jsonb),public.clear_fintrack_data() to authenticated;
