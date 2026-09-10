# Continuity audit — 2026-09-10

## Follow-through status (supersedes initial local-only status below)

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
