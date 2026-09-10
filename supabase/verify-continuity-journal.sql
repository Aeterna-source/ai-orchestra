begin;
do $$ declare j bigint; a jsonb; b jsonb; req jsonb; lease timestamptz:=now(); begin
 insert into public.os_jobs(job_type,profile,status,locked_at,result) values('interpret_event','__journal_test__','running',lease,'{"journalVersion":1}') returning id into j;
 req:='{"table":"memory_atoms","operation":"insert","row":{"profile":"__journal_test__","atom_type":"observation","content":"rollback test"},"single":true,"required":true}';
 a:=public.continuity_journal_step(j,lease,'test:0',req);
 b:=public.continuity_journal_step(j,lease,'test:0',req);
 if a is distinct from b or (select count(*) from public.memory_atoms where profile='__journal_test__')<>1 then raise exception 'Replay failed'; end if;
 req:=jsonb_build_object('table','memory_atoms','operation','select','single',true,'filters',jsonb_build_array(jsonb_build_object('key','id','value',a->>'id')));
 b:=public.continuity_journal_step(j,lease,'read:0',req);
 if b->>'id' is distinct from a->>'id' then raise exception 'Typed id filter failed'; end if;
 begin
  perform public.continuity_journal_step(j,lease,'invalid:0','{"table":"memory_atoms","operation":"insert","row":{"profile":"__journal_test__","nonexistent_column":5,"content":"must rollback"}}');
  raise exception 'Invalid insert accepted';
 exception when undefined_column then null; end;
 if exists(select 1 from public.continuity_job_steps where job_id=j and step='invalid:0') then raise exception 'Failed step committed'; end if;
 begin
  perform public.continuity_journal_step(j,lease-interval '1 second','test:1',req);
  raise exception 'Lease accepted';
 exception when others then if sqlerrm='Lease accepted' then raise; end if; end;
 req:='{"table":"subject_space_nodes","operation":"upsert","row":{"profile":"__journal_test__","node_key":"test","title":"Test","node_type":"room"},"conflict":"profile,node_key","single":true}';
 perform public.continuity_journal_step(j,lease,'space:0','{"table":"subject_spaces","operation":"insert","row":{"profile":"__journal_test__","title":"Test","display_name":"Test"},"single":true}');
 a:=public.continuity_journal_step(j,lease,'space:1',req);
 b:=public.continuity_journal_step(j,lease,'space:2',jsonb_set(req,'{row,title}','"Updated"'));
 if a->>'id' is distinct from b->>'id' or b->>'title'<>'Updated' then raise exception 'Upsert failed'; end if;
 insert into public.memory_atoms(profile,atom_type,content) values('__journal_test__','observation','second');
 begin
  perform public.continuity_journal_step(j,lease,'rollback:0','{"table":"memory_atoms","operation":"update","row":{"profile":"__journal_test__","content":"must not commit"},"single":true}');
  raise exception 'Cardinality failure missing';
 exception when others then if sqlerrm='Cardinality failure missing' then raise; end if; end;
 if exists(select 1 from public.memory_atoms where profile='__journal_test__' and content='must not commit') then raise exception 'Partial mutation committed'; end if;
 if exists(select 1 from public.continuity_job_steps where job_id=j and step='rollback:0') then raise exception 'Failed journal committed'; end if;
end $$;
rollback;
