create table if not exists public.spud_code_agent_jobs (
  id bigserial primary key,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  mode text not null check (mode in ('inspect','diagnose','propose')),
  task text not null,
  profile text not null default 'Spud',
  source text not null default 'telegram',
  telegram jsonb,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.spud_code_agent_jobs enable row level security;
revoke all on public.spud_code_agent_jobs from public, anon, authenticated;
grant select, insert, update on public.spud_code_agent_jobs to service_role;
grant usage, select on sequence public.spud_code_agent_jobs_id_seq to service_role;

create index if not exists spud_code_agent_jobs_status_run_after_idx
  on public.spud_code_agent_jobs(status, run_after, id);

create index if not exists spud_code_agent_jobs_created_at_idx
  on public.spud_code_agent_jobs(created_at desc);
