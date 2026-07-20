create table if not exists public.transaction_voids (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id text not null,
  transaction_data jsonb not null,
  voided_at timestamptz not null default now(),
  unique (user_id, transaction_id)
);
alter table public.transaction_voids enable row level security;
create policy "own transaction voids" on public.transaction_voids for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);

create or replace function public.void_fintrack_transaction(target_id text)
returns void language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); tx jsonb; begin
  if uid is null then raise exception 'Usuario no autenticado'; end if;
  select to_jsonb(t) into tx from public.transactions t where t.id=target_id and t.user_id=uid;
  if tx is null then raise exception 'Transacción no encontrada'; end if;
  insert into public.transaction_voids(id,user_id,transaction_id,transaction_data)
  values ('tv'||extract(epoch from clock_timestamp())::bigint||substr(md5(random()::text),1,6),uid,target_id,tx)
  on conflict(user_id,transaction_id) do update set transaction_data=excluded.transaction_data,voided_at=now();
  delete from public.transactions where id=target_id and user_id=uid;
end; $$;
grant execute on function public.void_fintrack_transaction(text) to authenticated;
