# Event Horizon

A three-day prototype that analyzes one vendor arrival change using one Claude
request, exact time calculations in code, and local approve/reject behavior.

## Current build

The local implementation provides a Next.js backend and reusable session-state
functions for Crystal's interface. The homepage is a minimal scaffold. The
coordinator input and report screens are still to be integrated with her work.

- GET /api/event returns the seeded planning.v1 input.
- POST /api/analyze accepts that input with a proposed arrival time and returns
  the validated report, calculated setup finish and overlap, and proposed time.
- After a validated report, the opt-in Recovery Engine at POST /api/recovery makes
  a separate AI call to propose internal follow-up tasks. It recalculates impact,
  validates risk indexes, event task IDs, and evidence references, and ties each
  proposal to both a recovery run ID and its source analysis run ID. Suggestions
  are not saved, do not modify the event, and cannot contact vendors.
- src/lib/session.ts implements pending analysis, response receipt, cancellation,
  approval, and rejection for browser session state.
- src/server/anthropic.ts makes one server-side Anthropic request per analysis.
  It uses claude-opus-4-6 with medium effort and disables SDK retries.
- The server returns explicit input, output, configuration, timeout, and provider
  errors. Errors block a successful report and leave event data untouched.

## Run locally

Use Node.js 22 or newer.

1. Run npm ci.
2. Copy .env.example to .env.local and set ANTHROPIC_API_KEY locally.
3. Run npm run dev.
4. GET /api/event for the input example. POST that JSON to /api/analyze.

The selected model is configurable through ANTHROPIC_MODEL. Keep medium effort
compatible with the configured model. The API key stays on the server.

## Vendor directory

The vendor finder at `/vendors` is a stretch feature, separate from the core P0
Planning/Readiness demo. Recovery Engine remains the first stretch priority. It uses
the fictional JSON directory unless both `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` are set in `.env.local`. When configured, `GET /api/vendors`
reads the public `vendors` table using the publishable key and relies on its row-level
security policy. Do not put a Supabase service-role key in the app. The expected columns
are `id`, `name`, `category`, `borough`, `description`,
`contact_email`, `price_min`, `price_max`, `capacity_min`, `capacity_max`, `rating`, `review_count`,
`review_summary`, `source_url`, and `is_synthetic`. Prices, capacity, ratings,
reviews, and availability should remain unknown unless verified.

Run npm run typecheck, npm test, and npm run build for local verification.
Provider tests simulate responses. On November 5, 2026, one live Claude Opus 4.6
medium analysis passed through POST /api/analyze with the team's API key. It returned
the dependent catering task and the code-calculated 30-minute overlap. The first
live response failed schema validation; enabling structured JSON output resolved it.

## Handoff to Crystal

The starting structure follows her November 5 Slack corrections:
proposed_change is inside snapshot, times use HH:MM:00 or null, and the output
keeps affected_task_ids, scheduling_risks, unknowns, and recommendation.
Display only HH:MM in the coordinator interface.

The Zod schemas and exported types are in src/lib/contract.ts.
The revised implementation-aligned schema from Crystal is still pending. This
implementation is a proposed integration boundary, not a verified integration
with her unpublished code.

- event.time_zone is an IANA zone. All entered clock values belong to
  event.event_date. Setup duration can roll into the following date.
  Ambiguous/nonexistent daylight-saving times are rejected for clarification.
- tasks[].depends_on_vendor_ids explicitly records setup dependencies. Code
  flags only linked tasks whose start precedes setup completion.
- calculation contains setup_finish (ISO date with offset), overlap_minutes,
  affected_task_ids, and unknowns. Missing inputs produce null calculations.
- The response has analysis, calculation, and proposed_arrival_time.
- Errors preserve her agent/contract_version/status envelope and return an
  error object with code, message, and details.
- An analysis action calls beginAnalysis with a unique requestId. Editing the
  proposed arrival must call clearProposal so a previous response cannot enable
  approval. Route successful packets through receiveAnalysis and failures
  through failAnalysis. decide requires review-ready state and applies the
  arrival only on approval. These helpers are intended for React state.
- The request ID is a client correlation token. Durable snapshot versions and
  approval endpoints are outside this local-session implementation. A null
  proposed arrival can be analyzed and rejected, but decide refuses to approve it.

## Scope and collaboration

The authoritative requirements are in docs/PRD.md and its linked Google Doc.
Separate Readiness and Vendor Follow-up agents, audit history, cost analysis,
and persisted version checks are stretch work.

Crystal owns her Planning implementation and interface. This change supplies a
replaceable server adapter and session helpers while her revised schema is
pending. Compare those contracts before combining the code.

Work locally on Vantagepoint, review PRs into develop, and promote to main only
after approval. Ask Anastasiya before pushing or opening a PR.
