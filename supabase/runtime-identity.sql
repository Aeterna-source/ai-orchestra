-- Apply before enabling RUNTIME_IDENTITY_ENABLED. Existing context_packets
-- contains both ordinary context logs and versioned runtime packets. No new table.
begin;

create index if not exists context_packets_completed_runtime_idx
  on public.context_packets (profile, id desc)
  where packet->'runtimeIdentity'->>'status' = 'completed';

create unique index if not exists context_packets_pending_runtime_idx
  on public.context_packets (profile)
  where packet->'runtimeIdentity'->>'status' = 'pending';

create or replace function public.runtime_identity_begin(p_profile text, p_token text, p_lease_seconds integer default 180)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  prior jsonb;
  packet_id bigint;
begin
  if p_profile is null or length(p_profile) = 0 or p_token is null or length(p_token) < 16 then
    raise exception 'Invalid runtime lease';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('runtime_identity:' || p_profile, 0));
  -- Expired owners are fenced out. They can never complete a packet later.
  update public.context_packets
  set packet = jsonb_set(packet, '{runtimeIdentity,status}', '"abandoned"'::jsonb)
  where profile = p_profile and packet->'runtimeIdentity'->>'status' = 'pending'
    and (packet->'runtimeIdentity'->>'leaseExpires')::timestamptz <= clock_timestamp();
  if exists (select 1 from public.context_packets where profile = p_profile
    and packet->'runtimeIdentity'->>'status' = 'pending') then return null; end if;

  select jsonb_build_object('id', id::text, 'runtime', (packet->'runtimeIdentity') - 'leaseToken' - 'leaseExpires')
    into prior from public.context_packets
    where profile = p_profile and packet->'runtimeIdentity'->>'status' = 'completed'
    order by id desc limit 1;
  insert into public.context_packets (profile, source, chat_scope, packet)
  values (p_profile, 'runtime', 'private', jsonb_build_object('runtimeIdentity', jsonb_build_object(
    'version', 1, 'status', 'pending', 'leaseToken', p_token,
    'leaseExpires', clock_timestamp() + make_interval(secs => greatest(30, least(p_lease_seconds, 600))),
    'previousPacketId', prior->>'id')))
  returning id into packet_id;
  return jsonb_build_object('id', packet_id::text, 'previous', prior);
end;
$$;

create or replace function public.runtime_identity_update(p_profile text, p_token text, p_patch jsonb,
  p_status text default 'pending', p_lease_seconds integer default 180)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  packet_id bigint;
  runtime jsonb;
  latest_id text;
begin
  if p_status not in ('pending', 'completed', 'failed') then raise exception 'Invalid runtime status'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Invalid runtime patch'; end if;
  if exists (select 1 from jsonb_object_keys(p_patch) as k(key)
    where key not in ('state','exchange','delivery','evidence','contextPacketId','diagnostics','source','chatScope')) then
    raise exception 'Immutable runtime field in patch';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('runtime_identity:' || p_profile, 0));
  select id, packet->'runtimeIdentity' into packet_id, runtime from public.context_packets
    where profile = p_profile and packet->'runtimeIdentity'->>'status' = 'pending'
      and packet->'runtimeIdentity'->>'leaseToken' = p_token
      and (packet->'runtimeIdentity'->>'leaseExpires')::timestamptz > clock_timestamp()
    for update;
  if packet_id is null then return false; end if;
  runtime := runtime || p_patch;
  if p_status = 'completed' then
    if jsonb_typeof(runtime->'state') is distinct from 'object'
      or coalesce(length(runtime->'state'->>'state_summary'), 0) = 0
      or jsonb_typeof(runtime->'exchange') is distinct from 'object'
      or coalesce(runtime->'exchange'->>'action', '') not in ('responded','passed','ended')
      or coalesce(runtime->'delivery'->>'status', '') not in ('telegram_sent','http_finished') then
      raise exception 'Incomplete runtime exchange';
    end if;
    select id::text into latest_id from public.context_packets where profile = p_profile
      and packet->'runtimeIdentity'->>'status' = 'completed' order by id desc limit 1;
    if latest_id is distinct from runtime->>'previousPacketId' then raise exception 'Runtime prior changed'; end if;
  end if;
  runtime := runtime || jsonb_build_object('status', p_status,
    'leaseExpires', clock_timestamp() + make_interval(secs => greatest(30, least(p_lease_seconds, 600))));
  if p_status <> 'pending' then
    runtime := (runtime - 'leaseToken' - 'leaseExpires') || jsonb_build_object('finishedAt', clock_timestamp());
  end if;
  update public.context_packets set packet = jsonb_set(packet, '{runtimeIdentity}', runtime) where id = packet_id;
  return true;
end;
$$;

revoke all on function public.runtime_identity_begin(text,text,integer) from public, anon, authenticated;
revoke all on function public.runtime_identity_update(text,text,jsonb,text,integer) from public, anon, authenticated;
grant execute on function public.runtime_identity_begin(text,text,integer) to service_role;
grant execute on function public.runtime_identity_update(text,text,jsonb,text,integer) to service_role;
commit;
