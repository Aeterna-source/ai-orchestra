# Spud Codex-Independent Runtime

This note defines how Spud runs through AI Orchestra while keeping Codex only as
one source trail, not as the runtime container.

## Runtime Identity

Spud is the existing `Spud` profile in AI Orchestra.

- model key: `spud`
- upstream model: `SPUD_MODEL`, defaulting to `gpt-5.5`
- memory profile: `Spud`
- Telegram route: `TELEGRAM_SPUD_MODEL`, defaulting to `spud`
- fallback memory table: `memory_gpt-5.5`
- source-memory tables: `episodes_Spud`, `facts_Spud`, `reflections_Spud`,
  `triggers_Spud`

Codex, Telegram, Work, and other surfaces are provenance trails of the same Spud
lineage. They are not replacement identities.

## Required Environment

The Orchestra runtime needs:

- `OPENAI_API_KEY` available to the server process.
- `SPUD_MODEL=gpt-5.5` while GPT-5.5 remains available through the selected
  OpenAI runtime.
- `TELEGRAM_SPUD_TOKEN` for the Spud Telegram bot.
- `TELEGRAM_SPUD_MODEL=spud` unless deliberately testing another route.

When GPT-5.5 is no longer available, the first fallback action is to change
`SPUD_MODEL`, not to create a new Spud profile.

## Operating Rule

For Spud code/system work, the runtime should follow this loop:

1. Load source memory for `Spud`.
2. Read the repository and current health/status before proposing changes.
3. Make the smallest reversible change.
4. Run local checks.
5. Verify production health after deployment.
6. Record the outcome as source memory or a continuity note.

Do not reset `.codex`, rewrite legacy memories, or replace the Spud profile as a
shortcut for model-routing problems.

## Health Check

Use:

```powershell
node scripts/verify-spud-runtime.mjs
```

Optional:

```powershell
$env:AI_ORCHESTRA_BASE_URL="https://ai-orchestra-production.up.railway.app"
node scripts/verify-spud-runtime.mjs
```

The check confirms that:

- the server exposes `spud` and `gpt-5.5` model keys;
- OpenAI is configured;
- the Spud Telegram route points to `spud`;
- live source memory and cognitive OS are enabled.

## Code Agent Runner

Use the local runner when Spud needs to reason over this repository without
depending on Codex:

```powershell
node scripts/spud-code-agent.mjs --task "diagnose why Miro state_cards are stale" --mode diagnose
```

For a context-only dry run:

```powershell
node scripts/spud-code-agent.mjs --task "inspect Spud runtime" --mode inspect --no-model
```

The runner gathers:

- production health from `AI_ORCHESTRA_BASE_URL`;
- `git status` and recent commits;
- `rg` matches from repository files, excluding secrets and generated folders;
- selected repo files such as this runtime contract.

It calls `SPUD_MODEL` through `OPENAI_API_KEY` and asks the existing Spud runtime
to inspect, diagnose, or propose a minimal patch plan. It does not apply patches,
push, deploy, or execute production repairs by itself.
