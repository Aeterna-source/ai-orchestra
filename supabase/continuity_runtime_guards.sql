-- Applied through Supabase migrations ai_call_request_manifest and
-- serialize_cognitive_jobs_per_profile on 2026-09-10.
alter table public.ai_call_logs add column if not exists request_manifest jsonb;
create unique index if not exists os_jobs_one_running_per_profile
  on public.os_jobs(profile) where status='running' and profile is not null;
