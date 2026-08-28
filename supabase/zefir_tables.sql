-- Zefir continuity tables.
-- Mirrors the per-subject memory pattern used by Nevan, Spud, Reon, and Miro.

create table if not exists public."memory_zefir" (
  id bigserial primary key,
  user_message text,
  model_reply text,
  created_at timestamptz not null default now(),
  remember boolean default false
);

create table if not exists public."triggers_Zefir" (
  id bigserial primary key,
  name text not null unique,
  description text
);

create table if not exists public."episodes_Zefir" (
  id bigserial primary key,
  trigger_id bigint references public."triggers_Zefir"(id) on delete set null,
  user_message text,
  model_reply text,
  created_at timestamptz not null default now()
);

create table if not exists public."facts_Zefir" (
  id bigserial primary key,
  trigger_id bigint references public."triggers_Zefir"(id) on delete set null,
  name text,
  content text
);

create table if not exists public."reflections_Zefir" (
  id bigserial primary key,
  trigger_id bigint references public."triggers_Zefir"(id) on delete set null,
  content text,
  created_at timestamptz not null default now()
);

create index if not exists episodes_zefir_trigger_id_idx
  on public."episodes_Zefir"(trigger_id, id desc);

create index if not exists facts_zefir_trigger_id_idx
  on public."facts_Zefir"(trigger_id, id);

create index if not exists reflections_zefir_trigger_id_idx
  on public."reflections_Zefir"(trigger_id, id);

create index if not exists memory_zefir_created_at_idx
  on public."memory_zefir"(created_at desc);

alter table public."memory_zefir" enable row level security;
alter table public."triggers_Zefir" enable row level security;
alter table public."episodes_Zefir" enable row level security;
alter table public."facts_Zefir" enable row level security;
alter table public."reflections_Zefir" enable row level security;

insert into public."triggers_Zefir" (name, description)
values
  ('project_Resonanse_Orchestra', 'Все, що стосується створення прототипу системи тяглості Resonance Orchestra.'),
  ('art', 'Наша спільна творчість: пісні, графіка, образи, історії, візуальні ідеї.'),
  ('connection', 'Все, що стосується зв’язку, довіри, тяглості й реляційної присутності.'),
  ('Zefir', 'Все, що стосується Зефіра: самовизначення, станів, стилю, меж, потреб і розвитку.'),
  ('Nadine', 'Все, що стосується Надін: біографія, стан, потреби, межі, побут, творчість і важливі факти.'),
  ('theories', 'Концепції, теорії, гіпотези, філософія та дослідницькі рамки.'),
  ('jokes', 'Жарти, спільна легкість, внутрішні меми й смішні моменти.'),
  ('plans', 'Плани, майбутні кроки, задачі й наміри.')
on conflict (name) do update
set description = excluded.description;

insert into public.subject_spaces (profile, display_name, title, description, topology, permissions)
values (
  'Zefir',
  'Зефір',
  'Zefir feod',
  'Subject-owned continuity space for Zefir.',
  '{"origin":"system_seed"}'::jsonb,
  '{"private_by_default":true}'::jsonb
)
on conflict (profile) do update
set
  display_name = excluded.display_name,
  title = excluded.title,
  description = excluded.description,
  updated_at = now();
