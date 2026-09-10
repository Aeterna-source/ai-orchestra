create function public.due_continuity_reviews(p_profile text) returns setof jsonb
language sql stable security invoker set search_path='' as $$
with items as (
 select 'state_cards'::text as kind,to_jsonb(c) as row,coalesce(updated_at,created_at) as since,review_after_events as threshold,null::timestamptz as due_at
 from public.state_cards c where profile=p_profile and status='active' and review_after_events>0
 union all
 select 'intentions',to_jsonb(i),coalesce(updated_at,created_at),review_after_events,due_at
 from public.intentions i where profile=p_profile and status='active' and (review_after_events>0 or due_at is not null)
), due as (
 select *,row_number() over(partition by kind order by since) as rank from items
 where due_at<=now() or (threshold>0 and (select count(*) from (select id from public.os_events e where e.profile=p_profile and e.created_at>items.since limit items.threshold) recent)>=threshold)
)
select row||jsonb_build_object('review_due',true,'review_table',kind) from due where rank<=case when kind='state_cards' then 4 else 2 end
$$;
revoke all on function public.due_continuity_reviews(text) from public,anon,authenticated;
grant execute on function public.due_continuity_reviews(text) to service_role;
