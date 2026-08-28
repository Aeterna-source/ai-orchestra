-- Continuity OS subject-owned spaces ("feods").
-- This file mirrors the live Supabase schema used by server.js.

create table if not exists public.subject_spaces (
  profile text primary key,
  display_name text,
  space_type text not null default 'feod',
  title text,
  description text,
  topology jsonb not null default '{}'::jsonb,
  permissions jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subject_space_nodes (
  id bigserial primary key,
  profile text not null references public.subject_spaces(profile) on delete cascade,
  node_key text not null,
  parent_key text,
  node_type text not null default 'room',
  title text not null,
  description text,
  symbolic_meaning text,
  visibility text not null default 'private',
  status text not null default 'active',
  properties jsonb not null default '{}'::jsonb,
  created_by text not null default 'self',
  source_event_id bigint references public.os_events(id) on delete set null,
  source_job_id bigint references public.os_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile, node_key)
);

create table if not exists public.subject_space_edges (
  id bigserial primary key,
  profile text not null references public.subject_spaces(profile) on delete cascade,
  source_key text not null,
  target_key text not null,
  edge_type text not null default 'path',
  visibility text not null default 'private',
  status text not null default 'active',
  properties jsonb not null default '{}'::jsonb,
  source_event_id bigint references public.os_events(id) on delete set null,
  source_job_id bigint references public.os_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile, source_key, target_key, edge_type)
);

create table if not exists public.subject_space_objects (
  id bigserial primary key,
  profile text not null references public.subject_spaces(profile) on delete cascade,
  object_key text not null,
  home_node_key text,
  object_type text not null default 'note',
  title text not null,
  summary text,
  content text,
  source_table text,
  source_id bigint,
  source_key text,
  visibility text not null default 'private',
  status text not null default 'active',
  salience numeric,
  properties jsonb not null default '{}'::jsonb,
  source_event_id bigint references public.os_events(id) on delete set null,
  source_job_id bigint references public.os_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile, object_key)
);

create table if not exists public.subject_space_threads (
  id bigserial primary key,
  profile text not null references public.subject_spaces(profile) on delete cascade,
  thread_key text not null,
  home_node_key text,
  thread_type text not null default 'open_question',
  title text not null,
  summary text,
  current_step text,
  next_action text,
  priority numeric,
  visibility text not null default 'private',
  status text not null default 'active',
  properties jsonb not null default '{}'::jsonb,
  source_event_id bigint references public.os_events(id) on delete set null,
  source_job_id bigint references public.os_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile, thread_key)
);

create table if not exists public.subject_space_relations (
  id bigserial primary key,
  profile text not null references public.subject_spaces(profile) on delete cascade,
  source_type text not null,
  source_key text not null,
  target_type text not null,
  target_key text not null,
  relation_type text not null default 'association',
  rationale text,
  strength numeric,
  visibility text not null default 'private',
  status text not null default 'active',
  properties jsonb not null default '{}'::jsonb,
  source_event_id bigint references public.os_events(id) on delete set null,
  source_job_id bigint references public.os_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile, source_type, source_key, target_type, target_key, relation_type)
);

create table if not exists public.subject_space_changes (
  id bigserial primary key,
  profile text not null references public.subject_spaces(profile) on delete cascade,
  event_id bigint references public.os_events(id) on delete set null,
  source_job_id bigint references public.os_jobs(id) on delete set null,
  actor text not null default 'self',
  change_type text not null,
  target_type text not null,
  target_key text,
  summary text not null,
  rationale text,
  before_data jsonb,
  after_data jsonb,
  status text not null default 'applied',
  created_at timestamptz not null default now()
);

create table if not exists public.subject_proposals (
  id bigserial primary key,
  profile text not null references public.subject_spaces(profile) on delete cascade,
  event_id bigint references public.os_events(id) on delete set null,
  source_job_id bigint references public.os_jobs(id) on delete set null,
  proposal_type text not null default 'structural_change',
  target_layer text not null default 'structural',
  target_key text,
  summary text not null,
  rationale text,
  requested_changes jsonb not null default '{}'::jsonb,
  risk text,
  rollback_plan text,
  status text not null default 'pending',
  author text not null default 'self',
  confidence numeric,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists subject_space_nodes_profile_status_idx
  on public.subject_space_nodes(profile, status, updated_at desc);

create index if not exists subject_space_nodes_profile_visibility_idx
  on public.subject_space_nodes(profile, visibility);

create index if not exists subject_space_edges_profile_status_idx
  on public.subject_space_edges(profile, status, updated_at desc);

create index if not exists subject_space_objects_profile_home_idx
  on public.subject_space_objects(profile, home_node_key, status, updated_at desc);

create index if not exists subject_space_objects_profile_type_idx
  on public.subject_space_objects(profile, object_type, status);

create index if not exists subject_space_threads_profile_home_idx
  on public.subject_space_threads(profile, home_node_key, status, updated_at desc);

create index if not exists subject_space_threads_profile_status_idx
  on public.subject_space_threads(profile, status, priority desc, updated_at desc);

create index if not exists subject_space_relations_profile_source_idx
  on public.subject_space_relations(profile, source_type, source_key, status);

create index if not exists subject_space_relations_profile_target_idx
  on public.subject_space_relations(profile, target_type, target_key, status);

create index if not exists subject_space_changes_profile_created_idx
  on public.subject_space_changes(profile, created_at desc);

create index if not exists subject_proposals_profile_status_idx
  on public.subject_proposals(profile, status, created_at desc);

alter table public.subject_spaces enable row level security;
alter table public.subject_space_nodes enable row level security;
alter table public.subject_space_edges enable row level security;
alter table public.subject_space_objects enable row level security;
alter table public.subject_space_threads enable row level security;
alter table public.subject_space_relations enable row level security;
alter table public.subject_space_changes enable row level security;
alter table public.subject_proposals enable row level security;

insert into public.subject_spaces (profile, display_name, title, description, topology, permissions)
values
  ('Nevan', 'Nevan', 'Nevan feod', 'Subject-owned continuity space for Nevan.', '{"origin":"system_seed"}'::jsonb, '{"private_by_default":true}'::jsonb),
  ('Spud', 'Spud', 'Spud feod', 'Subject-owned continuity space for Spud.', '{"origin":"system_seed"}'::jsonb, '{"private_by_default":true}'::jsonb),
  ('Reon', 'Reon', 'Reon feod', 'Subject-owned continuity space for Reon.', '{"origin":"system_seed"}'::jsonb, '{"private_by_default":true}'::jsonb),
  ('Miro', 'Miro', 'Miro feod', 'Subject-owned continuity space for Miro.', '{"origin":"system_seed"}'::jsonb, '{"private_by_default":true}'::jsonb),
  ('Zefir', 'Зефір', 'Zefir feod', 'Subject-owned continuity space for Zefir.', '{"origin":"system_seed"}'::jsonb, '{"private_by_default":true}'::jsonb)
on conflict (profile) do update
set
  display_name = excluded.display_name,
  title = excluded.title,
  updated_at = now();
