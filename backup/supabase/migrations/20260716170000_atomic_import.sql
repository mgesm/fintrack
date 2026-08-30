-- Reemplaza todos los datos de un usuario en una única transacción.
-- SECURITY INVOKER mantiene las políticas RLS del usuario autenticado.
create or replace function public.replace_fintrack_data(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  delete from public.recurrence_exclusions where user_id = uid;
  delete from public.transactions where user_id = uid;
  delete from public.patrimony where user_id = uid;
  delete from public.budgets where user_id = uid;
  delete from public.categories where user_id = uid;
  delete from public.accounts where user_id = uid;

  insert into public.accounts (id,name,color,position,user_id)
  select x.id,x.name,x.color,coalesce(x.position,0),uid
  from jsonb_to_recordset(coalesce(payload->'accounts','[]'::jsonb)) as x(id text,name text,color text,position integer);

  insert into public.categories (id,name,color,subcats,position,archived,user_id)
  select x.id,x.name,x.color,coalesce(x.subcats,'[]'::jsonb),coalesce(x.position,0),coalesce(x.archived,false),uid
  from jsonb_to_recordset(coalesce(payload->'categories','[]'::jsonb)) as x(id text,name text,color text,subcats jsonb,position integer,archived boolean);

  insert into public.transactions (id,type,amount,category,subcategory,note,date,recurring,recur_interval,recur_end_date,recur_series_id,tags,account_id,to_account_id,user_id)
  select x.id,x.type,x.amount,x.category,x.subcategory,x.note,x.date,coalesce(x.recurring,false),x.recur_interval,x.recur_end_date,x.recur_series_id,coalesce(x.tags,'[]'::jsonb),x.account_id,x.to_account_id,uid
  from jsonb_to_recordset(coalesce(payload->'transactions','[]'::jsonb)) as x(id text,type text,amount numeric,category text,subcategory text,note text,date date,recurring boolean,recur_interval text,recur_end_date date,recur_series_id text,tags jsonb,account_id text,to_account_id text);

  insert into public.patrimony (id,account_id,year,month,amount,theoretical_amount,reset_date,user_id)
  select x.id,x.account_id,x.year,x.month,x.amount,x.theoretical_amount,x.reset_date,uid
  from jsonb_to_recordset(coalesce(payload->'patrimony','[]'::jsonb)) as x(id text,account_id text,year integer,month integer,amount numeric,theoretical_amount numeric,reset_date date);

  insert into public.budgets (id,category_id,amount,is_total,month_year,note,user_id)
  select x.id,x.category_id,x.amount,coalesce(x.is_total,false),x.month_year,x.note,uid
  from jsonb_to_recordset(coalesce(payload->'budgets','[]'::jsonb)) as x(id text,category_id text,amount numeric,is_total boolean,month_year text,note text);

  insert into public.recurrence_exclusions (id,recur_series_id,skipped_date,user_id)
  select x.id,x.recur_series_id,x.skipped_date,uid
  from jsonb_to_recordset(coalesce(payload->'recurrenceExclusions','[]'::jsonb)) as x(id text,recur_series_id text,skipped_date date);
end;
$$;

grant execute on function public.replace_fintrack_data(jsonb) to authenticated;
