-- PostgreSQL Migration: System Performance & Telemetry Dashboard

-- 1. Create Performance Logging Table
create table if not exists public.system_performance_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  event_type text not null, -- 'web_vital', 'api_latency', 'server_action'
  event_name text not null, -- e.g., 'TTFB', 'LCP', '/api/orders'
  duration_ms numeric not null,
  user_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Optimize telemetry logs for dashboard queries (filtering by type, organization, and timestamp)
create index if not exists system_performance_logs_org_type_idx
on public.system_performance_logs (organization_id, event_type, created_at desc);

create index if not exists system_performance_logs_event_name_idx
on public.system_performance_logs (event_name, created_at desc);

-- 2. Row Level Security (RLS) for isolated telemetry logging
alter table public.system_performance_logs enable row level security;

create policy "telemetry_admin_all" on public.system_performance_logs
  for all to authenticated using (true) with check (true);

-- 3. Telemetry Views for Database Health & Index Hit Rates
create or replace view public.system_database_stats as
select
  schemaname,
  relname as table_name,
  n_live_tup as row_count,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size,
  pg_relation_size(relid) as size_bytes,
  coalesce(idx_scan, 0) as index_scans,
  coalesce(seq_scan, 0) as sequential_scans
from pg_stat_user_tables
where schemaname = 'public';

create or replace view public.system_index_stats as
select
  schemaname,
  relname as table_name,
  indexrelname as index_name,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  idx_scan as index_scans
from pg_stat_user_indexes
where schemaname = 'public';

-- Grant access permissions for Views to authenticated sessions & server service role admin
grant select on public.system_database_stats to authenticated, service_role;
grant select on public.system_index_stats to authenticated, service_role;
