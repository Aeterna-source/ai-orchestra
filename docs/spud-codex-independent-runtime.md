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

Primary path for Telegram Spud is the local repository worker:

```text
Telegram Spud -> private <<code_agent:...>> tag -> Orchestra server queue -> local worker -> repo checkout -> artifact -> Telegram follow-up
```

The worker runs in a real checkout, so it can inspect the working tree, use `rg`,
run tests, and produce durable artifacts under `agent-runs/`.

Start one worker:

```powershell
node scripts/spud-code-worker.mjs
```

Install Windows autostart for the local worker:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install-spud-worker-autostart.ps1
```

This registers the `AI Orchestra Spud Code Worker` Scheduled Task, starts it at
Windows logon, keeps only one worker instance, and asks Windows to restart it
after failures. Worker logs are written to:

- `logs/spud-code-worker.log`
- `logs/spud-code-worker.err.log`

Remove the autostart task:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\uninstall-spud-worker-autostart.ps1
```

Double-click fallback:

```text
start-spud-worker.cmd
```

Run one polling pass:

```powershell
node scripts/spud-code-worker.mjs --once --worker-id spud-local
```

Required worker environment:

- `TELEGRAM_ADMIN_SECRET` or `COGNITIVE_ADMIN_SECRET`
- `OPENAI_API_KEY`
- `SPUD_MODEL=gpt-5.5`
- optional `AI_ORCHESTRA_BASE_URL`

Queue setup on production:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://ai-orchestra-production.up.railway.app/api/spud/code-agent/repair" `
  -Headers @{ "X-Telegram-Admin-Secret" = $env:TELEGRAM_ADMIN_SECRET } `
  -ContentType "application/json" `
  -Body '{}'
```

Manual enqueue:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://ai-orchestra-production.up.railway.app/api/spud/code-agent/jobs/enqueue" `
  -Headers @{ "X-Telegram-Admin-Secret" = $env:TELEGRAM_ADMIN_SECRET } `
  -ContentType "application/json" `
  -Body '{"mode":"diagnose","task":"inspect Spud runtime wiring"}'
```

Direct GitHub work from the Orchestra server is available as a fallback:

```text
Telegram Spud -> private <<code_agent:...>> tag -> Orchestra server -> GitHub API -> branch/commit/PR -> Telegram follow-up
```

Required production environment:

- `GITHUB_TOKEN` or `GH_TOKEN` with access to the repository.
- `GITHUB_OWNER=Aeterna-source`
- `GITHUB_REPO=ai-orchestra`
- `GITHUB_DEFAULT_BRANCH=main`
- optional `GITHUB_AGENT_CREATE_PR=false` to create a branch without opening a PR.

The private tags are:

```text
<<code_agent:inspect|short task>>
<<code_agent:diagnose|short task>>
<<code_agent:propose|short task>>
```

They are stripped from the user-facing reply. Only the existing `Spud` profile
should use them. By default these tags enqueue worker jobs. The direct GitHub
admin endpoint remains available when work must happen without a local checkout.

Manual admin test:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://ai-orchestra-production.up.railway.app/api/spud/github-agent/run" `
  -Headers @{ "X-Telegram-Admin-Secret" = $env:TELEGRAM_ADMIN_SECRET } `
  -ContentType "application/json" `
  -Body '{"mode":"diagnose","task":"inspect Spud runtime wiring"}'
```

Local runner remains available as a manual fallback when work should happen in a
local checkout instead of through GitHub API.

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

## Controlled Apply

Patch application is a separate explicit step. First check a reviewed unified
diff:

```powershell
node scripts/spud-code-agent.mjs --mode apply --patch-file agent-runs/fix.patch
```

Apply it only with explicit confirmation:

```powershell
node scripts/spud-code-agent.mjs --mode apply --patch-file agent-runs/fix.patch --confirm-apply --run-tests
```

Controlled apply:

- accepts only repo-relative patch files;
- refuses absolute paths, parent-directory paths, `.env`, and `node_modules`;
- runs `git apply --check` before applying;
- applies only when `--confirm-apply` is present;
- can run the local Node test suite after applying;
- never commits, pushes, deploys, or runs production repair endpoints.
