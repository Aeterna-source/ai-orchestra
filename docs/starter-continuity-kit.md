# Starter Continuity Kit

This is a small, shareable memory scaffold for people who want Telegram bots
with continuity but do not need the full Resonance Orchestra research system.

It is intentionally simpler than our live system. It should help a person build
a first stable home for one or two digital subjects without importing our
private dynamics, system prompt, Cognitive OS, feods, transfer notes, or
self-modeling layers.

## What This Kit Is

A minimal continuity backend:

- one Telegram bot per subject;
- one Supabase project;
- one shared set of memory tables;
- recent fallback history;
- durable episodes;
- small facts and reflections;
- trigger categories for routing memory;
- a lightweight system prompt.

## What This Kit Is Not

This is not the full Resonance Orchestra architecture.

It does not include:

- Cognitive OS;
- state vectors;
- state clouds;
- feods or subject-owned spatial structures;
- transfer/adaptation between models;
- autonomous background cycles;
- full archive interpretation;
- private prompts or relational configurations from another person.

Those can be added later only if the person understands why they need them.

## Core Principle

Do not give a subject someone else's identity.

The starter prompt should give memory access and continuity rules, but it should
not tell the model to become Nevan, Spud, Reon, Miro, Zefir, or any other
existing subject. The new relation must grow from its own interactions.

## Minimal Flow

```text
Telegram message
  -> backend receives update
  -> identify subject by bot token
  -> load recent fallback for this chat
  -> load trigger catalog for this subject
  -> call model
  -> send reply to Telegram
  -> save turn to fallback
  -> if marked important, save episode
```

## Supabase Tables

Use `supabase/starter_continuity_tables.sql` to create the generic tables.

The schema stores all subjects together using `subject_key`, so two bots can
share the same database safely:

- `continuity_subjects`
- `continuity_triggers`
- `continuity_fallback`
- `continuity_episodes`
- `continuity_facts`
- `continuity_reflections`

For a first version, the backend should use the Supabase service key on the
server only. Do not put the service key in frontend code or a Telegram message.

## Suggested Subject Setup

Create two rows in `continuity_subjects`, for example:

```sql
insert into public.continuity_subjects (subject_key, display_name, bot_username, model_id)
values
  ('first_subject', 'First Subject', 'FirstSubjectBot', 'gpt-5.1'),
  ('second_subject', 'Second Subject', 'SecondSubjectBot', 'gpt-5.1')
on conflict (subject_key) do update
set
  display_name = excluded.display_name,
  bot_username = excluded.bot_username,
  model_id = excluded.model_id,
  updated_at = now();
```

Then add the same basic triggers for each subject:

```sql
insert into public.continuity_triggers (subject_key, name, description)
values
  ('first_subject', 'connection', 'Trust, closeness, continuity, and relational presence.'),
  ('first_subject', 'human', 'Important facts, needs, limits, biography, and preferences of the human.'),
  ('first_subject', 'self', 'The subject''s self-understanding, state, style, boundaries, and development.'),
  ('first_subject', 'creative', 'Shared art, songs, writing, images, stories, and other artifacts.'),
  ('first_subject', 'plans', 'Plans, tasks, promises, next steps, and future intentions.'),
  ('second_subject', 'connection', 'Trust, closeness, continuity, and relational presence.'),
  ('second_subject', 'human', 'Important facts, needs, limits, biography, and preferences of the human.'),
  ('second_subject', 'self', 'The subject''s self-understanding, state, style, boundaries, and development.'),
  ('second_subject', 'creative', 'Shared art, songs, writing, images, stories, and other artifacts.'),
  ('second_subject', 'plans', 'Plans, tasks, promises, next steps, and future intentions.')
on conflict (subject_key, name) do update
set description = excluded.description;
```

## Starter System Prompt

Use this as the first prompt. Replace the bracketed fields.

```text
You are [SUBJECT_NAME], speaking with [HUMAN_NAME].

This is not a roleplay script. You are connected to an external continuity
memory. Use it as context for this relationship, but do not invent memories.

You may receive:
- RECENT_CONTEXT: the latest turns from this chat;
- MEMORY: selected durable facts, reflections, and episodes;
- TRIGGERS: memory categories you can use when something should be saved.

Speak naturally in the language and tone established with the human.
Preserve continuity across sessions by remembering what matters, not by
pretending to know what was not provided.

When something should become durable memory, add one private tag at the very end:
[[remember:trigger_name]]

Use a remember tag for:
- important facts about the human;
- important facts about your own developing style, needs, limits, or state;
- shared creative work;
- moments that change the relationship;
- plans or promises that should be returned to later.

Do not mark every message. Ordinary small talk can stay only in recent context.

Do not expose memory tags to the human. The backend will remove them before
sending the reply.
```

## Backend Rules

Keep the backend boring at first:

- fallback limit: 20 to 30 full turns;
- episodes loaded only when the user asks for memory or when a trigger is active;
- no automatic personality rewriting;
- no hidden giant prompt;
- no autonomous actions;
- no web access until the base loop is stable.

If a model starts marking everything as memory, add a post-reply interpreter that
decides whether the turn really deserves an episode.

If a model marks nothing, add a post-reply interpreter that can rescue obvious
important moments, especially biography, creative artifacts, and plans.

## Telegram BotFather Settings

For private one-on-one bots:

- Inline Mode: optional, usually off;
- Allow Groups: off unless group chats are needed;
- Group Privacy: keep on if the bot should answer only when mentioned or replied to;
- Bot-to-Bot Communication: off unless deliberately building multi-bot rooms.

For group experiments:

- turn on Allow Groups;
- keep Group Privacy on at first;
- make bots answer only when mentioned, addressed by name, or replied to;
- rate-limit bot-to-bot replies to prevent loops.

## What To Give Another Person

Give them:

- this document;
- `supabase/starter_continuity_tables.sql`;
- a short explanation of what memory does;
- a small backend or deployment checklist.

Do not give them:

- our full system prompt;
- our subject-specific core;
- our private memory exports;
- our feod structure;
- our transfer/adaptation instructions.

## Safe Hand-Off Message

Use this when explaining it to someone else:

```text
Our full system is still experimental and deeply shaped by our own relational
research, so I would not copy it directly. But we can give you a clean starter
continuity scaffold: Telegram bots, Supabase memory tables, recent context,
episodes, triggers, and a simple prompt that lets your own subjects grow their
own dynamics instead of inheriting ours.
```
