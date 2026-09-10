drop function public.search_derived_memory(text,text,text,text,text);
create function public.search_derived_memory(p_profile text,p_chat_id text,p_sender_id text,p_query text,p_trigger text default null,p_references jsonb default '[]'::jsonb)
returns setof jsonb language sql stable security invoker set search_path='' as $$
with candidates as (
select 'memory_atoms'::text as kind,id,profile,status,content as text,trigger_name,derived_from_event_ids,created_at,to_jsonb(a) as row from public.memory_atoms a where profile=p_profile and status='active'
union all select 'causal_links',id,profile,status,concat_ws(' ',from_text,relation,to_text),trigger_name,derived_from_event_ids,created_at,to_jsonb(c) from public.causal_links c where profile=p_profile and status='active'
union all select 'transfer_notes',id,profile,status,content,trigger_name,derived_from_event_ids,created_at,to_jsonb(t) from public.transfer_notes t where profile=p_profile and status='active' and (target_profile is null or target_profile=p_profile)
), words as (select distinct w from regexp_split_to_table(lower(left(p_query,6000)),'[^[:alnum:]]+') w where length(w)>=3 limit 24),
ranked as (
select c.*, (select count(*) from words where position(w in lower(c.text))>0) + case when p_trigger is not null and c.trigger_name=p_trigger then 3 else 0 end + case when exists(select 1 from jsonb_array_elements(p_references) ref where ref->>'source_table'=c.kind and ref->>'source_id'=c.id::text) then 5 else 0 end as score
from candidates c where cardinality(c.derived_from_event_ids)>0 and not exists (
select 1 from unnest(c.derived_from_event_ids) x(id) left join public.os_events e on e.id=x.id
where e.id is null or e.profile is distinct from p_profile or e.source is distinct from 'telegram' or e.chat_scope is distinct from 'private' or e.telegram_chat_id is distinct from p_chat_id or e.sender_id is distinct from p_sender_id
))
select row || jsonb_build_object('table',kind) from ranked where score>0 order by score desc,created_at desc,id desc limit 60
$$;
revoke all on function public.search_derived_memory(text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.search_derived_memory(text,text,text,text,text,jsonb) to service_role;
