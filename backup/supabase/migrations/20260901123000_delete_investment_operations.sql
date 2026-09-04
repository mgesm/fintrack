create or replace function public.delete_investment_operation(p_operation_id text)
returns void
language plpgsql
security invoker
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  linked_transaction_id text;
begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  select transaction_id into linked_transaction_id
  from public.investment_operations
  where id=p_operation_id and user_id=uid;
  if linked_transaction_id is null then raise exception 'Operación no encontrada'; end if;
  delete from public.investment_operations where id=p_operation_id and user_id=uid;
  delete from public.transactions where id=linked_transaction_id and user_id=uid;
end;
$$;

grant execute on function public.delete_investment_operation(text) to authenticated;
