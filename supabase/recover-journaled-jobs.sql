create function public.recover_continuity_jobs() returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 update public.os_jobs set status=case when result->>'journalVersion'='1' and attempts<max_attempts then 'retry' else 'failed' end,
 error='Worker interrupted; journaled jobs resume from persisted steps',run_after=now(),updated_at=now()
 where status='running' and locked_at<now()-interval '30 minutes';
 get diagnostics n=row_count; return n;
end $$;
revoke all on function public.recover_continuity_jobs() from public,anon,authenticated;
grant execute on function public.recover_continuity_jobs() to service_role;
