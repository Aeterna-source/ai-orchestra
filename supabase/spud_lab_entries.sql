create table if not exists public.spud_lab_entries (
  id bigserial primary key,
  profile text not null default 'Spud',
  entry_type text not null default 'report'
    check (entry_type in ('report', 'proposal', 'change', 'plan', 'decision', 'artifact', 'note')),
  status text not null default 'active'
    check (status in ('active', 'pending', 'completed', 'failed', 'archived')),
  title text not null,
  summary text,
  body text,
  source text not null default 'code-worker',
  job_id bigint,
  artifact_path text,
  related_commit text,
  tags text[] not null default '{}',
  visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'transfer')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.spud_lab_entries enable row level security;
revoke all on public.spud_lab_entries from public, anon, authenticated;
grant select, insert, update on public.spud_lab_entries to service_role;
grant usage, select on sequence public.spud_lab_entries_id_seq to service_role;

create index if not exists spud_lab_entries_profile_status_idx
  on public.spud_lab_entries(profile, status, created_at desc);

create index if not exists spud_lab_entries_profile_type_idx
  on public.spud_lab_entries(profile, entry_type, created_at desc);

create index if not exists spud_lab_entries_job_idx
  on public.spud_lab_entries(job_id);
