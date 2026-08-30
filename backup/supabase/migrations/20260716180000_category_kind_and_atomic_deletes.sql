alter table public.categories add column if not exists kind text not null default 'expense' check (kind in ('expense','income'));
update public.categories set kind='income' where lower(trim(name)) in ('sueldo','ingresos');

create or replace function public.delete_fintrack_account(target_id text)
returns void language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  if exists(select 1 from public.transactions where user_id=uid and (account_id=target_id or to_account_id=target_id)) then raise exception 'La cuenta tiene transacciones asociadas'; end if;
  delete from public.patrimony where user_id=uid and account_id=target_id;
  delete from public.accounts where user_id=uid and id=target_id;
end; $$;

create or replace function public.delete_fintrack_category(target_id text)
returns void language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  delete from public.budgets where user_id=uid and category_id=target_id;
  delete from public.categories where user_id=uid and id=target_id;
end; $$;

grant execute on function public.delete_fintrack_account(text), public.delete_fintrack_category(text) to authenticated;
