create sequence if not exists public.subject_events_subject_sequence_seq;

create table if not exists public.subject_events (
  id bigserial primary key,
  profile text not null,
  subject_sequence bigint not null default nextval('public.subject_events_subject_sequence_seq'),
  event_kind text not null default 'inbound'
    check (event_kind in ('inbound', 'outbound', 'exchange', 'worker', 'system', 'attention_decision')),
  source text not null default 'telegram',
  chat_scope text not null default 'private'
    check (chat_scope in ('private', 'group', 'api', 'system')),
  channel_key text,
  chat_id text,
  message_id text,
  sender_id text,
  sender_name text,
  actor_role text not null default 'human'
    check (actor_role in ('human', 'subject', 'system', 'worker', 'other')),
  addressed boolean not null default false,
  response_required boolean not null default false,
  response_status text not null default 'observed'
    check (response_status in ('pending', 'responded', 'deferred', 'ignored', 'observed', 'failed', 'none')),
  visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'public', 'transfer')),
  trigger_id bigint,
  trigger_name text,
  os_event_id bigint references public.os_events(id) on delete set null,
  fallback_table text,
  fallback_row_id bigint,
  episode_table text,
  episode_id bigint,
  causal_parent_event_id bigint references public.subject_events(id) on delete set null,
  related_event_ids bigint[] not null default '{}',
  user_message text,
  model_reply text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile, subject_sequence)
);

alter table public.subject_events enable row level security;
revoke all on public.subject_events from public, anon, authenticated;
grant select, insert, update on public.subject_events to service_role;
grant usage, select on sequence public.subject_events_id_seq to service_role;
grant usage, select on sequence public.subject_events_subject_sequence_seq to service_role;

create index if not exists subject_events_profile_sequence_idx
  on public.subject_events(profile, subject_sequence desc);

create index if not exists subject_events_profile_created_idx
  on public.subject_events(profile, created_at desc);

create index if not exists subject_events_profile_scope_idx
  on public.subject_events(profile, chat_scope, created_at desc);

create index if not exists subject_events_response_status_idx
  on public.subject_events(profile, response_status, created_at desc);

create index if not exists subject_events_parent_idx
  on public.subject_events(causal_parent_event_id);

create index if not exists subject_events_os_event_idx
  on public.subject_events(os_event_id);

notify pgrst, 'reload schema';
