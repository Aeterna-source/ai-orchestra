create table if not exists public.continuity_job_steps (
 job_id bigint references public.os_jobs(id) on delete cascade,
 step text not null, request jsonb not null, response jsonb,
 created_at timestamptz not null default now(), primary key(job_id,step)
);
alter table public.continuity_job_steps enable row level security;
revoke all on public.continuity_job_steps from public,anon,authenticated;
grant select,insert on public.continuity_job_steps to service_role;

create or replace function public.continuity_journal_step(p_job bigint,p_lease timestamptz,p_step text,p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 j public.os_jobs; cached public.continuity_job_steps;
 t text := p_request->>'table'; op text := p_request->>'operation';
 r jsonb := p_request->'row'; f jsonb; k text; cols text; vals text; sets text;
 predicate text := 'true'; ordering text := ''; conflict_cols text; sql text; result jsonb;
 profile_suffix text; fallback_table text;
begin
 select * into j from public.os_jobs where id=p_job for update;
 if not found or j.status <> 'running' or j.locked_at is distinct from p_lease then raise exception 'Worker lease lost'; end if;
 if j.result->>'journalVersion' is distinct from '1' then raise exception 'Unsupported journal version'; end if;
 select * into cached from public.continuity_job_steps where job_id=p_job and step=p_step;
 if found then
   if cached.request->>'table' <> t or cached.request->>'operation' <> op then raise exception 'Journal sequence mismatch'; end if;
   return cached.response;
 end if;
 profile_suffix := case when j.profile='Miro' then 'Grokulchik' else j.profile end;
 fallback_table := case j.profile when 'Nevan' then 'memory_chatgpt_4o_latest' when 'Reon' then 'memory_gpt_5_1' when 'Spud' then 'memory_gpt-5.5' when 'Miro' then 'memory_grok-4.3' when 'Grokulchik' then 'memory_grok-4.3' when 'Zefir' then 'memory_zefir' end;
 if not (t=any(array['memory_atoms','state_cards','causal_links','state_snapshots','state_vectors','drift_events','intentions','transfer_notes','meta_memory','subject_spaces','subject_space_nodes','subject_space_edges','subject_space_objects','subject_space_threads','subject_space_relations','subject_space_changes','subject_proposals','core_change_proposals','core_nodes','os_events']) or t='episodes_'||profile_suffix or t='triggers_'||profile_suffix or t=fallback_table) then raise exception 'Table not allowed'; end if;
 if t='core_nodes' and op<>'select' then raise exception 'Core writes require review'; end if;
 if op not in ('select','insert','update','upsert') then raise exception 'Operation not allowed'; end if;
if t='os_events' then
   predicate := format('x.id=%L',j.event_id);
 elsif t=fallback_table then
   predicate := format('x.id=(select fallback_row_id from public.os_events where id=%L)',j.event_id);
 elsif t not in ('episodes_'||profile_suffix,'triggers_'||profile_suffix) then
   predicate := format('x.profile=%L',j.profile);
   if op<>'select' and r->>'profile' is distinct from j.profile then raise exception 'Wrong profile'; end if;
 end if;
 if (t='os_events' or t=fallback_table) and op not in ('select','update') then raise exception 'Invalid source operation'; end if;
 if t='triggers_'||profile_suffix and op<>'select' then raise exception 'Read only'; end if;
 for f in select value from jsonb_array_elements(coalesce(p_request->'filters','[]')) loop
   predicate := predicate || format(' and x.%I is not distinct from (jsonb_populate_record(null::public.%I,%L::jsonb)).%I',f->>'key',t,jsonb_build_object(f->>'key',f->'value'),f->>'key');
 end loop;
 for f in select value from jsonb_array_elements(coalesce(p_request->'order','[]')) loop
   ordering := ordering || case when ordering='' then ' order by ' else ',' end || format('%I %s',f->>'key',case when f->>'ascending'='false' then 'desc' else 'asc' end);
 end loop;
 if op='select' then
   sql := format('select coalesce(jsonb_agg(to_jsonb(q)),''[]''::jsonb) from (select x.* from public.%I x where %s %s) q',t,predicate,ordering);
 else
   if jsonb_typeof(r)<>'object' or r='{}'::jsonb or r ? 'id' then raise exception 'Invalid row'; end if;
   select string_agg(format('%I',key),','),string_agg(format('v.%I',key),','),string_agg(format('%I=v.%I',key,key),',') into cols,vals,sets from jsonb_object_keys(r) key;
   if op='update' then
     sql := format('with changed as (update public.%I x set %s from jsonb_populate_record(null::public.%I,$1) v where %s returning x.*) select coalesce(jsonb_agg(to_jsonb(changed)),''[]''::jsonb) from changed',t,sets,t,predicate);
   else
     sql := format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) v',t,cols,vals,t);
     if op='upsert' then
       select string_agg(format('%I',trim(value)),',') into conflict_cols from unnest(string_to_array(p_request->>'conflict',',')) value;
       select string_agg(format('%I=excluded.%I',key,key),',') into sets from jsonb_object_keys(r) key;
       if conflict_cols is null then raise exception 'Missing conflict key'; end if;
       sql := sql || format(' on conflict (%s) do update set %s',conflict_cols,sets);
     end if;
     sql := 'with changed as ('||sql||' returning *) select coalesce(jsonb_agg(to_jsonb(changed)),''[]''::jsonb) from changed';
   end if;
 end if;
 execute sql into result using r;
 if p_request->>'single'='true' then
   if jsonb_array_length(result)>1 or (p_request->>'required'='true' and jsonb_array_length(result)=0) then raise exception 'Expected one row'; end if;
   result := result->0;
 end if;
 insert into public.continuity_job_steps(job_id,step,request,response) values(p_job,p_step,p_request,result);
 return result;
end $$;
revoke all on function public.continuity_journal_step(bigint,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.continuity_journal_step(bigint,timestamptz,text,jsonb) to service_role;
