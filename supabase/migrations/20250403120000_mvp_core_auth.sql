-- Chrona MVP Task 1: profiles + connected data tables + RLS
-- Run in Supabase SQL editor or via supabase db push

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  company_name text,
  created_at timestamptz default now()
);

create table if not exists public.connected_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('upload', 'instagram')),
  status text not null check (status in ('pending', 'active', 'error')),
  meta jsonb,
  created_at timestamptz default now()
);

create table if not exists public.processed_metrics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.profiles(id) on delete cascade,
  period_start date,
  period_end date,
  spend numeric default 0,
  leads integer default 0,
  deals integer default 0,
  revenue numeric default 0,
  cash_inflow numeric default 0,
  cash_outflow numeric default 0,
  net_cash numeric default 0,
  raw_data jsonb,
  created_at timestamptz default now()
);

create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.profiles(id) on delete cascade,
  generated_at timestamptz default now(),
  period_start date,
  period_end date,
  main_issue text,
  recommended_action text,
  priority_score numeric,
  data_context jsonb
);

alter table public.profiles enable row level security;
alter table public.connected_sources enable row level security;
alter table public.processed_metrics enable row level security;
alter table public.insights enable row level security;

-- profiles: one row per auth user
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (id = auth.uid());

-- company-scoped tables: company_id equals owning user id
create policy "connected_sources_select_own"
  on public.connected_sources for select
  to authenticated
  using (company_id = auth.uid());

create policy "connected_sources_insert_own"
  on public.connected_sources for insert
  to authenticated
  with check (company_id = auth.uid());

create policy "connected_sources_update_own"
  on public.connected_sources for update
  to authenticated
  using (company_id = auth.uid())
  with check (company_id = auth.uid());

create policy "connected_sources_delete_own"
  on public.connected_sources for delete
  to authenticated
  using (company_id = auth.uid());

create policy "processed_metrics_select_own"
  on public.processed_metrics for select
  to authenticated
  using (company_id = auth.uid());

create policy "processed_metrics_insert_own"
  on public.processed_metrics for insert
  to authenticated
  with check (company_id = auth.uid());

create policy "processed_metrics_update_own"
  on public.processed_metrics for update
  to authenticated
  using (company_id = auth.uid())
  with check (company_id = auth.uid());

create policy "processed_metrics_delete_own"
  on public.processed_metrics for delete
  to authenticated
  using (company_id = auth.uid());

create policy "insights_select_own"
  on public.insights for select
  to authenticated
  using (company_id = auth.uid());

create policy "insights_insert_own"
  on public.insights for insert
  to authenticated
  with check (company_id = auth.uid());

create policy "insights_update_own"
  on public.insights for update
  to authenticated
  using (company_id = auth.uid())
  with check (company_id = auth.uid());

create policy "insights_delete_own"
  on public.insights for delete
  to authenticated
  using (company_id = auth.uid());
