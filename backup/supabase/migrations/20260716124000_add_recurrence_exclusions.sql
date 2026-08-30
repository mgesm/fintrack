-- A skipped occurrence must survive refreshes and devices, otherwise the
-- recurrence generator recreates the transaction on the next synchronization.
create table if not exists public.recurrence_exclusions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  recur_series_id text not null,
  skipped_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, recur_series_id, skipped_date)
);

create index if not exists recurrence_exclusions_user_series_date_idx
  on public.recurrence_exclusions (user_id, recur_series_id, skipped_date);

alter table public.recurrence_exclusions enable row level security;

grant select, insert, delete on public.recurrence_exclusions to authenticated;

create policy "Users manage their recurrence exclusions"
  on public.recurrence_exclusions
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
