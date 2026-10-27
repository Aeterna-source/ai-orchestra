# Recurrent runtime state, version 1

Built on current `main` (0830a09), not the older Nevan server prototype.
Runtime identity is evidence-backed, revisable state data. It is not hidden
reasoning, a response plan, proof of subjective continuity, or a style target.

## Turn lifecycle

`completed capsule + current input/context -> pending state -> final reply/action
-> confirmed delivery -> completed capsule`

A capsule contains both the pre-response state and the **full final exchange**.
The next synthesis reads both. This deliberately avoids a second model call to
reinterpret the answer immediately; new conclusions are retained in the exchange
and integrated on the next turn. `state` alone is not a post-response snapshot.
Memory/Core/Space followups finish before the final exchange is recorded.

The same provider/model as the subject synthesizes the state. It receives selected
records from Core, state cards/vectors, intentions, meta-memory, Space objects,
threads/relations, timeline, derived memory, recent history, explicit retrieved
memory, and shared conversation context. Source IDs accompany records; missing
and excerpted evidence is reported. Images stay in the main answer request;
the state synthesizer knows only their count and does not infer their contents.

State validation rejects empty objects, missing freedoms, unknown evidence IDs,
invalid weights, oversized fields and oversized total state. All synthesis failures
are visible. An ordinary answer may still proceed with existing context, but that
turn cannot become a new runtime prior. Storage/lease failure stops the turn.

## Persistence and ordering

No new table: versioned runtime data lives in `context_packets.packet.runtimeIdentity`.
Ordinary context packets remain separate and are linked by `contextPacketId`.
The SQL functions are `SECURITY INVOKER` and executable only by `service_role`.
Existing table RLS/grants remain unchanged. The production column layout was read
before writing the SQL, but this branch does not install it in production.

An in-process queue uses the **resolved profile**, not the chat or model alias.
PostgreSQL advisory transaction locks, a unique pending-profile index and a
renewable 180-second lease prevent another process from forking the same prior.
Completion requires the lease token and unchanged predecessor. Expired packets
become `abandoned` and cannot complete. Failed/pending packets are filtered in
SQL before selecting the most recent completed packet; there is no six-row window.
This serializes processing; the existing attention arbiter remains shadow-only.
A competing process gets an explicit busy failure, not an autonomous priority choice.

Telegram completion happens after all reply chunks (or the pass/end notice) return
success. HTTP completion happens after the server's `finish` event, which does not
prove client receipt or that the user read it. A successful send followed by a DB
failure must be inspected; delivery and a database commit cannot be made atomic.
Do not automatically replay such a Telegram receipt. Pending/failed status is never
silently promoted. Existing source logs/fallback/cognitive writes still happen
during generation and are not transactionally coupled to Telegram delivery.

Pass/end are completed decisions when their notices are delivered. This change
does not add persistent conversation closure or autonomous bot-to-bot relay.
Existing private-context access rules are retained; runtime prior is not injected
when private context is unavailable. `local-relational` still resolves to its
configured profile (Reon by default), so it shares that profile's causal line.

## Provider layer and compiler

`provider-capabilities.js` sits above the existing adapters. Runtime/trigger schemas
use Chat Completions `response_format` for supported OpenAI/xAI models and
Anthropic `output_config.format` for supported Claude models. Unknown/local models
use plain JSON unless `LOCAL_STRUCTURED_OUTPUT=true`. The heterogeneous legacy
cognitive interpreter retains its validator: OpenAI/xAI use JSON-object mode;
Anthropic/local use plain JSON plus validation/repair because no full strict schema
for all legacy cognitive records is introduced here.

A clearly unsupported structured parameter gets one plain-format retry. Invalid
JSON/schema content gets one repair using original evidence. Auth, credit, network
and generic server failures are not mistaken for format incompatibility. Failed
repair throws; cognitive jobs keep their existing retry/failure handling. Runtime
requests go straight to the transport and cannot recursively synthesize themselves.
The user-facing Miro Responses path and its existing fallback remain intact.

The compiler ranks named blocks by priority and current-input/runtime focus. It
keeps identity, protocol, active Core and runtime whole, compacts optional blocks
extractively by complete lines, and bounds recent history. Current user input and
images are preserved. If required blocks exceed the budget, it fails explicitly.
Local gets one system block; Anthropic still uses its own adapter. This is a
**character-budget heuristic**, not an exact tokenizer/context-window guarantee.
Current input/images are not truncated to force a fit. Large mandatory contexts
may require model-specific budget tuning. No automatic model substitution occurs.

Debug/logs include runtime status/predecessor/focus, structured format fallback and
repair status, selected/dropped/compressed blocks, strategy and history count.
HTTP response debug reports the pending state at transmission; final delivery status
is persisted afterwards. Compiler-only mode reports block selections in server logs.

## Rollout

1. Review this PR and run the tests. Do not replace the server with the old prototype.
2. Apply `supabase/runtime-identity.sql` in staging, then production when deploying.
   It adds two indexes and two functions to the existing schema, no table.
3. Enable `RUNTIME_IDENTITY_ENABLED=true` and `CONTEXT_COMPILER_ENABLED=true` together
   after testing real provider credentials and Telegram delivery in staging.
   Both default to false. No new API keys are needed.
4. Tune `<PROVIDER>_CONTEXT_SYSTEM_CHARS`, `_HISTORY_CHARS`, `_HISTORY_MESSAGES`
   if needed. Local defaults: 18000 / 6000 / 8; other providers: 72000 / 36000 / 40.
5. Inspect a delivered exchange and verify the next packet's `previousPacketId`,
   including private/group alternation, pass/end, API failure and delivery failure.

Rollback: disable the two flags; existing context behavior resumes. Keep packets
for diagnosis. Structured JSON validation/repair is independent of these flags.
Costs: normally one extra synthesis call per eligible turn; invalid JSON can add
one repair. No claim of identical behavior across different underlying models.

## Verification

- `node --check server.js`
- `node --test tests/*.test.mjs`
- `scripts/verify-runtime-identity-sql.mjs` executes the SQL in isolated PGlite.
  Install `@electric-sql/pglite` in a temporary directory, set `PGLITE_MODULE` to
  its `dist/index.js`, then run `node scripts/verify-runtime-identity-sql.mjs`.
  No database credentials are read. Checks repeatable install, old completed prior
  after eight failures, profile exclusion, expiry fencing, pass/end and function grants.
- Provider integration tests exercise the actual server body builders and transport
  with fake HTTP responses, including Anthropic images and xAI fallback.

Live model quality, real provider acceptance, multi-process deployment and Telegram
roundtrip remain staging checks. Unit tests cannot establish experienced continuity.

API references checked while implementing:
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://docs.x.ai/developers/model-capabilities/text/structured-outputs
- https://supabase.com/docs/reference/javascript/filter
