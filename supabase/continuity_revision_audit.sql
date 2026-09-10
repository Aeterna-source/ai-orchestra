create table public.continuity_record_revisions (
 id bigint generated always as identity primary key,
 source_table text not null check (source_table in ('core_nodes','intentions')),
 source_id bigint not null,
 profile text not null,
 operation text not null,
 previous_record jsonb,
 next_record jsonb,
 recorded_at timestamptz not null default now()
);
alter table public.continuity_record_revisions enable row level security;
revoke all on public.continuity_record_revisions from public, anon, authenticated;
grant select, insert on public.continuity_record_revisions to service_role;
grant usage, select on sequence public.continuity_record_revisions_id_seq to service_role;
create index on public.continuity_record_revisions(source_table, source_id, id desc);
insert into public.continuity_record_revisions(source_table, source_id, profile, operation, next_record)
select 'core_nodes',id,profile,'baseline',to_jsonb(c) from public.core_nodes c
union all select 'intentions',id,profile,'baseline',to_jsonb(i) from public.intentions i;
create function public.audit_continuity_revision() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.continuity_record_revisions(source_table,source_id,profile,operation,previous_record,next_record)
 values(TG_TABLE_NAME,coalesce(NEW.id,OLD.id),coalesce(NEW.profile,OLD.profile),TG_OP,
 case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end,
 case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end);
 return coalesce(NEW,OLD);
end;
$$;
revoke all on function public.audit_continuity_revision() from public,anon,authenticated;
grant execute on function public.audit_continuity_revision() to service_role;
create trigger core_revision_audit after insert or update or delete on public.core_nodes for each row execute function public.audit_continuity_revision();
create trigger intention_revision_audit after insert or update or delete on public.intentions for each row execute function public.audit_continuity_revision();
