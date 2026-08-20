-- Starter Continuity Kit schema.
-- Generic memory scaffold for one or more Telegram subjects.
-- Intended for server-side use with a Supabase service key.

create table if not exists public.continuity_subjects (
  subject_key text primary key,
  display_name text not null,
  bot_username text,
  model_id text,
  system_prompt text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.continuity_triggers (
  id bigserial primary key,
  subject_key text not null references public.continuity_subjects(subject_key) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (subject_key, name)
);

create table if not exists public.continuity_fallback (
  id bigserial primary key,
  subject_key text not null references public.continuity_subjects(subject_key) on delete cascade,
  chat_scope text not null default 'private',
  chat_id text,
  user_id text,
  user_message text,
  model_reply text,
  remember boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.continuity_episodes (
  id bigserial primary key,
  subject_key text not null references public.continuity_subjects(subject_key) on delete cascade,
  trigger_id bigint references public.continuity_triggers(id) on delete set null,
  user_message text,
  model_reply text,
  summary text,
  source_fallback_id bigint references public.continuity_fallback(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.continuity_facts (
  id bigserial primary key,
  subject_key text not null references public.continuity_subjects(subject_key) on delete cascade,
  trigger_id bigint references public.continuity_triggers(id) on delete set null,
  name text,
  content text not null,
  source_episode_id bigint references public.continuity_episodes(id) on delete set null,
  confidence numeric(4,3) not null default 0.800,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.continuity_reflections (
  id bigserial primary key,
  subject_key text not null references public.continuity_subjects(subject_key) on delete cascade,
  trigger_id bigint references public.continuity_triggers(id) on delete set null,
  content text not null,
  source_episode_id bigint references public.continuity_episodes(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists continuity_triggers_subject_name_idx
  on public.continuity_triggers(subject_key, name);

create index if not exists continuity_fallback_subject_chat_created_idx
  on public.continuity_fallback(subject_key, chat_scope, chat_id, created_at desc);

create index if not exists continuity_episodes_subject_trigger_created_idx
  on public.continuity_episodes(subject_key, trigger_id, created_at desc);

create index if not exists continuity_facts_subject_trigger_idx
  on public.continuity_facts(subject_key, trigger_id, updated_at desc);

create index if not exists continuity_reflections_subject_trigger_idx
  on public.continuity_reflections(subject_key, trigger_id, created_at desc);

alter table public.continuity_subjects enable row level security;
alter table public.continuity_triggers enable row level security;
alter table public.continuity_fallback enable row level security;
alter table public.continuity_episodes enable row level security;
alter table public.continuity_facts enable row level security;
alter table public.continuity_reflections enable row level security;

-- This starter schema assumes all access goes through a trusted backend using
-- the Supabase service key. Add explicit RLS policies only if you expose these
-- tables directly to authenticated client users.

