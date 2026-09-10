revoke all on function public.exec_sql(text) from public,anon,authenticated;
grant execute on function public.exec_sql(text) to service_role;
do $$ declare t text; begin
foreach t in array array['memory_chatgpt_4o_latest','episodes_Reon','triggers_Reon','reflections_Nevan','triggers_Nevan','facts_Reon','reflections_Reon','episodes_Nevan','triggers_Grokulchik','episodes_Grokulchik','facts_Spud','memory_gpt-5.5','episodes_Spud','triggers_Spud','facts_Nevan','facts_Grokulchik','reflections_Spud','memory_grok-4.3','memory_gpt_5_1','reflections_Grokulchik','telegram_group_messages','telegram_delivery_logs','telegram_processing_logs','ai_call_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on table public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on table public.%I to service_role',t);
end loop; end $$;
