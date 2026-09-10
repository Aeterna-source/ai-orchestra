-- Applied as durable_telegram_update_receipts on 2026-09-10.
create table public.telegram_update_receipts (
 bot_key text not null, update_id bigint not null, payload jsonb not null,
 status text not null default 'queued' check(status in ('queued','processing','completed','failed')),
 error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(bot_key,update_id)
);
alter table public.telegram_update_receipts enable row level security;
revoke all on public.telegram_update_receipts from public,anon,authenticated;
grant select,insert,update on public.telegram_update_receipts to service_role;
create unique index telegram_one_processing_per_bot on public.telegram_update_receipts(bot_key) where status='processing';
