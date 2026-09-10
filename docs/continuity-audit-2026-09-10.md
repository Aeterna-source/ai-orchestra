# Continuity audit — 2026-09-10

## Follow-through status (supersedes initial local-only status below)

v5/v6 add a durable, deduplicated Telegram inbox (receipt before HTTP acknowledgement, no automatic replay after uncertain delivery); full-archive source-filtered retrieval rather than a recent-row-only window; resolution of explicit shelf references to derived memory; event-count/date based due-review selection and targeted state-card update/archive with revision history. Read-only SQL verification confirms due reviews and full-archive candidates. A real Miro conversation produced live context_packets with selected records, so actual chat integration is evidenced. This does not establish subjective quality or full end-to-end recovery under every failure mode.

Current remaining work is narrower than the initial audit: transactional whole-job materialization/replay, profile acceptance of substantive Core proposals, deeper graph navigation and branch/transfer experiments. Historical repair/reconciliation remains separate from forward-path fixes; old data has not been guessed, merged or erased.

Deployed: 797436f (shadow retrieval), 80ff412 (webhook origin authentication), ad5c349 (targeted intentions), 85840f2 (live retrieval/group isolation). Production v3 reports live mode. Real server read-only checks selected 9 records each for Nevan/Spud/Miro/Reon and 7 for Zefir. Four locally credentialed bot endpoints return 403 unsigned and 200 for signed empty updates, with zero pending Telegram updates. Empty probes do not invoke models or send messages.

Database revision audit installed, with baseline snapshots of 15 Core rows and 436 intentions. Trigger tested inside a rolled-back transaction. The audit is protected with RLS and service-role-only access. Added an exact-request fingerprint column to ai_call_logs and a unique running-job-per-profile index.

Additional hardening in v4: authenticated web chat, escaped frontend output, public visualization strips narrative notes and separates raw from smoothed values; bounded trigger memory previews; interpreter structure validation; partial insert errors fail without unsafe automatic replay; FIFO checks and expired-worker detection; request fingerprinting after provider payload construction; preserved text attribution and interpreter authorship; narrow explicit repair signals.

These checks establish code/data paths, not subjective continuity quality. Outstanding design work remains: transactional/idempotent whole-job materialization and replay of old failed jobs; richer whole-archive search and graph traversal; executable review_after_events workflow; explicit profile acceptance of substantial Core proposals; historical duplicate-intention reconciliation; branch/transfer evaluation. No claim is made that the entire design document is implemented.

Rollback: application commits can be reverted without dropping the additive database audit tables/columns. Keep webhook secret registration when reverting code; Telegram secrets are compatible with the previous receiver. Do not roll back the job index while concurrent writers rely on it without checking running jobs. Existing historical records were not bulk rewritten or removed.

Scope: local server.js at a071890 plus read-only live database metadata and aggregate queries. Deployment revision and external workers not verified. No private conversation text exported and no database writes performed.

## Verified findings

1. `storeCognitiveInterpretation` writes memory_atoms, causal_links, transfer_notes. Live counts: 2210, 1143, 754 respectively. Local chat retrieval does not directly read these tables. `loadCognitiveContext` reads state cards, intentions, snapshots, meta-memory and vectors; trigger retrieval reads episodes/facts/reflections. Subject-space source references are rendered as labels rather than dereferenced. Some meaning may survive indirectly through other interpretation outputs; this is not evidence that all memory is lost.
2. Database has no non-internal triggers on the three tables above or intentions. Other services/functions were not exhaustively audited.
3. Live jobs: 1111 completed, 1 running at inspection. Of completed jobs, 87 have result.parsed=false. A running row alone is not evidence of a stuck worker.
4. Local intention updates insert new rows instead of addressing existing IDs. Live intentions include 406 active rows with action=update and 25 active create rows. This supports investigating accumulation; it does not prove all rows are duplicates.

## Local correction

Worker now rejects interpretation.parsed=false before derived records or post-interpret remember are written. Existing bounded retry/failed handling applies. Historical rows have not been replayed or relabelled. This patch does not fix partial insert failures or validate the full interpretation schema.

Validation: three isolated tests exercise the actual worker function with mocked dependencies: parse failure retries without writes, exhausted retries fail, valid interpretation completes. node --check server.js and git diff --check passed. No provider calls made. Patch not deployed.

## Next repair proposal

### Retrieval implementation added locally

`lib/derived-memory.js` now loads bounded recent and exact-trigger candidates from all three tables, checks every source event against the profile/private Telegram chat/sender, ranks by lexical overlap and trigger, deduplicates and returns up to nine bounded previews. Records without source evidence, archived records and notes addressed to another profile are excluded. Source-read failure returns unavailable with no injected text. API calls explicitly override source/telegram so request bodies cannot enable this new path.

`DERIVED_MEMORY_MODE=shadow` is the default: selected references are logged in context_packets.packet.derivedMemory, but do not alter the reply. `live` injects previews; `off` disables retrieval. Existing cognitive flags are respected. No deployment or environment change performed. Enabling live still requires verifying Telegram webhook origin protection and rollout scope. This module does not repair existing privacy behavior in other context layers.

Ten local tests pass, including worker tests and retrieval tests. Real database metadata check: 4106 of 4107 records have nonempty source lists consisting of existing private Telegram events for the same profile with chat/sender metadata; this count is not a relevance or full per-conversation eligibility test. No private text was fetched for that check.

Limitations: bounded lexical/trigger retrieval is not semantic search over the full archive; old off-trigger records can be missed. Cross-channel continuity is deliberately excluded until identity/access mapping exists. No source inference, automatic profile migration or intention merging is performed.

Build retrieval in shadow mode first, with no change to profile responses. Carry profile and chat scope into candidate selection; check source event audience before selecting derived records. Record selected IDs and source IDs, use bounded previews, and test that unrelated profiles and private events cannot enter group context. Review results before enabling retrieval for a selected profile. Preserve Core and subject-space contents.

Separately add explicit target intention ID and version handling; do not infer which old intention to close from similar text. Do not bulk close or merge the existing 406 update rows.

## v7 — materialization failure boundaries (2026-09-10)

- Persist the parsed interpretation in the job result before derived writes begin.
- Any error after that boundary fails the job without automatic replay, including unclassified transport errors and post-interpretation failures.
- Requeued checkpointed jobs require inspection; completion/failure transitions are guarded by running status and the claim timestamp.
- Core and subject-space database errors propagate instead of silently reporting partial success.
- Validation: 32 Node tests pass; syntax and diff checks pass. Production verification recorded after deployment.
- Limits: this is a durable checkpoint and conservative replay guard, not an atomic multi-table transaction. A process interruption may still leave partial records requiring inspection. Core proposal acceptance and transactional recovery remain unfinished.

## v8 — resumable writes and reviewed Core (2026-09-10)

- `continuity_job_steps` journals every materialization read and write. Each database operation and its receipt commit together. Replays return the original response, preserving branches after prior writes.
- Job checkpoints preserve the original event and interpretation. Resumption does not call the interpreter again. Materialization and episodic persistence have independent versioned step sequences.
- Claims and manual resumes serialize per profile in SQL. Expired journaled jobs retry within the attempt budget; older unjournaled failures remain manual. A failed job cannot resume after newer work started, because that requires semantic reconciliation.
- Interpreter Core writes now produce pending proposals with the exact prior row, proposed row and source event/job. `/core-review` provides authenticated before/after review. Accept/reject is atomic, repeated decisions are idempotent, stale baselines are superseded, and accepted writes retain the existing revision audit.
- This is per-step resumability, not one transaction for the entire interpretation. Do not change journaled execution order or feature flags while incomplete v1 jobs exist without a versioned migration. Preserve v1 handlers for outstanding jobs when introducing a new sequence.
- Added service-only RLS tables/functions. Security advisor uncovered legacy public SQL execution and 24 unprotected legacy tables; revoked anonymous SQL access and protected legacy memory/log tables. Verified server retrieval still works.
- Validation: 36 Node tests; live SQL tests in rollback transactions cover repeated inserts, lost/expired leases, typed filters, upsert, mutation rollback, Core accept/replay/stale rejection, queue ordering and stale resume refusal. No synthetic records retained. No paid model calls or Telegram messages sent by verification.
- Historical partial writes without a journal are not guessed or replayed. Core review currently records Nadine's operator decision; autonomous subject acceptance is not implemented or impersonated.

Production verification: v8 returned by health; all five retrieval checks passed; four configured Telegram endpoints accepted signed empty probes and rejected unsigned probes; no pending updates. Core review page rendered correctly, authenticated pending lists returned 200, anonymous access returned 403. At verification time no new real journaled conversations had occurred yet, so restart/replay behavior is evidenced by the Node and rollback SQL tests, not a fabricated live conversation.
