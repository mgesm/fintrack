-- Baseline schema migration (idempotent for fresh resets and production parity)
create table if not exists public.accounts (
  id text primary key,
  name text not null,
  color text,
  position integer not null default 0,
  is_investment boolean not null default false,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id text primary key,
  name text not null,
  color text,
  subcats jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  archived boolean not null default false,
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  icon text,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id text primary key,
  type text not null check (type in ('expense', 'income', 'transfer')),
  amount numeric not null,
  category text,
  subcategory text default '',
  note text default '',
  date date not null,
  recurring boolean not null default false,
  recur_interval text,
  recur_end_date date,
  recur_series_id text,
  recur_anchor_date date,
  tags text[] not null default array[]::text[],
  account_id text,
  to_account_id text,
  is_balance_adjustment boolean not null default false,
  balance_adjustment_patrimony_id text,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.patrimony (
  id text primary key,
  account_id text not null,
  year integer not null,
  month integer not null,
  amount numeric not null,
  theoretical_amount numeric,
  reset_date date,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id text primary key,
  category_id text,
  amount numeric not null,
  is_total boolean not null default false,
  month_year text not null,
  note text,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  path text not null,
  status text not null,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.backup_scheduler_secret (
  singleton boolean primary key default true,
  token_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_report_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  report_month text not null,
  path text not null,
  status text not null,
  error_message text,
  created_at timestamptz not null default now(),
  unique (user_id, report_month)
);

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.patrimony enable row level security;
alter table public.budgets enable row level security;
alter table public.backup_runs enable row level security;
alter table public.backup_scheduler_secret enable row level security;
alter table public.monthly_report_runs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'accounts' and policyname = 'Users manage their own accounts') then
    create policy "Users manage their own accounts" on public.accounts
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categories' and policyname = 'Users manage their own categories') then
    create policy "Users manage their own categories" on public.categories
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'transactions' and policyname = 'Users manage their own transactions') then
    create policy "Users manage their own transactions" on public.transactions
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'patrimony' and policyname = 'Users manage their own patrimony') then
    create policy "Users manage their own patrimony" on public.patrimony
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'budgets' and policyname = 'Users manage their own budgets') then
    create policy "Users manage their own budgets" on public.budgets
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'backup_runs' and policyname = 'Users read their own backup runs') then
    create policy "Users read their own backup runs" on public.backup_runs
      for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'monthly_report_runs' and policyname = 'Users read their own monthly report runs') then
    create policy "Users read their own monthly report runs" on public.monthly_report_runs
      for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end $$;

grant select, insert, update, delete on public.accounts, public.categories, public.transactions, public.patrimony, public.budgets to authenticated;
grant select on public.backup_runs, public.monthly_report_runs to authenticated;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('fintrack-backups', 'fintrack-backups', false),
           ('fintrack-reports', 'fintrack-reports', false)
    on conflict (id) do nothing;
  end if;
end $$;
