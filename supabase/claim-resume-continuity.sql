create function public.claim_continuity_job(p_id bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.os_jobs; p text;
begin
 select profile into p from public.os_jobs where id=p_id;
 if p is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('continuity-queue:'||p,0));
 select * into j from public.os_jobs where id=p_id for update;
 if j.status not in ('queued','retry') or j.run_after>now() then return null; end if;
 if exists(select 1 from public.os_jobs where profile=p and id<p_id and status in ('queued','retry','running')) then return null; end if;
 update public.os_jobs set status='running',attempts=attempts+1,locked_at=clock_timestamp(),updated_at=now() where id=p_id returning * into j;
 return to_jsonb(j);
end $$;
create function public.resume_continuity_job(p_id bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.os_jobs; p text;
begin
 select profile into p from public.os_jobs where id=p_id;
 if p is null then raise exception 'Job not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended('continuity-queue:'||p,0));
 select * into j from public.os_jobs where id=p_id for update;
 if j.status<>'failed' or j.result->>'journalVersion' is distinct from '1' then raise exception 'Not resumable'; end if;
 if exists(select 1 from public.os_jobs where profile=p and id>p_id and attempts>0) then raise exception 'Newer work exists; reconciliation required'; end if;
 update public.os_jobs set status='retry',attempts=0,run_after=now(),error=null,updated_at=now() where id=p_id;
 return jsonb_build_object('queued',true,'id',p_id);
end $$;
revoke all on function public.claim_continuity_job(bigint),public.resume_continuity_job(bigint) from public,anon,authenticated;
grant execute on function public.claim_continuity_job(bigint),public.resume_continuity_job(bigint) to service_role;
