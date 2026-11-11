# Event Horizon PRD

Source: https://docs.google.com/document/d/1eqek1tXTcvPv9cgyvkWScJjRMRW4HO3Phi-A7GKCodc

Snapshot of the revised three-day MVP, captured November 5, 2026.

Event Horizon — AI EVENT READINESS & TASK AUTOMATION

Product Requirements Document: Net New Build

Build name:  Event Horizon — AI Event Readiness and Task Automation MVP

Development tool — Crystal and Anastasiya use OpenAI Codex to help write, debug, and review the application code. The app’s AI analysis runs through the Anthropic Claude API.

Owners:  Crystal Watson and Anastasiya Glegg

Date: November 5, 2026 — revised for a three-day MVP

## 1. PROBLEM

When a vendor arrives late, an event coordinator must work out whether setup will finish before the event starts, identify dependent tasks, and decide what to adjust. A missed dependency can leave a room unready when guests arrive. Event Horizon supports this specific arrival-change decision for one event.

#### Concrete late-vendor scenario

- Illustrative scenario for the demo. Doors open at 6 PM. Catering needs 90 minutes to set up. Its arrival changes from 4 PM to 5 PM. Setup now ends at 6:30 PM, leaving a 30-minute overlap with the event.

- The coordinator needs to see the overlap, identify tasks that depend on catering being ready, and review a suggested next action before accepting the arrival change.

- The Aircall listing grounds the role in vendor coordination and run-of-show work. This scenario is a concrete design example. No coordinator interview has been conducted or quoted. Before resubmission, a short conversation with one coordinator can provide supporting evidence if available.

### 1a. Opportunity

Help a coordinator assess one vendor arrival change through one AI impact report and a clear approve or reject decision.

#### Market Opportunity

- Three-day scope with a fixed planning budget of 24 team-hours, 12 hours per person. Keep the core flow within this budget and defer stretch work.

- Source role listing: https://job-boards.greenhouse.io/aircallioinc/jobs/4470016009

### 1b. Users & Needs

Primary user — an event coordinator preparing one event and deciding what a changed vendor arrival means for setup and dependent tasks.

Secondary users:  Event manager or teammate reviewing readiness and follow-ups. Vendors are represented as event records, not app users.

#### Key User Needs

As an event coordinator, I need to see the scheduled arrival, setup duration, and event start together so I can assess a vendor change.

As an event coordinator, I need an explanation of affected tasks and missing facts so I can choose whether to accept the proposed arrival time.

## 2. PROPOSED SOLUTION

Event Horizon shows one seeded event. The coordinator enters a proposed vendor arrival time and requests analysis. Server-side code calculates setup completion and any overlap with the event start. One AI call performs the Planning/Readiness analysis and returns affected task IDs, scheduling_risks, missing facts, and a recommendation. The app checks the response structure and references, then displays the report with the calculated overlap. Approve applies the proposed arrival time to the local session event. Reject leaves the current arrival time intact. Analysis itself makes no event changes.

### 2a. Value Proposition

One AI analysis flow helps the coordinator understand a vendor delay, with exact time calculations handled by code and an explicit approve or reject choice.

### 2b. Top 3 MVP Value Props

The Vitamin — one seeded event view with the vendor arrival, setup duration, event start, and dependent tasks.

The Painkiller — one AI impact report explains affected tasks and missing information after an arrival change.

The Steroid — a 5 PM arrival plus 90-minute setup visibly produces a 6:30 PM finish and 30-minute overlap, alongside a grounded recommendation for the coordinator.

### 2c. Goals & Non-Goals

#### Goals

- Help a coordinator understand the effect of a vendor delay and make an informed approval decision.

- Reuse the existing Planning implementation where compatible. Handle readiness observations within the same AI response.

- Deliver the four P0 capabilities listed in section 3 by the end of day 3 within 24 team-hours.

#### Non-Goals

- Stretch only — separate Readiness and Vendor Follow-up agents, vendor message drafts, cost analysis, stale-version checks, audit history, multiple events, live integrations, custom event creation, and expanded security or evaluation suites.

- Stretch work begins only after the core flow is complete and reviewed. Any future messaging or integration requires a separate scope decision.

### 2d. Success Metrics

| Goal | Signal | Metric | Target |
| --- | --- | --- | --- |
| Useful impact report | Affected dependent tasks and missing facts match the supplied event | Three demo cases and one invalid-response check | Normal, late, and missing-information cases behave as specified. Invalid responses block approval. |
| Grounded AI recommendations | Suggestions cite event facts and propose a concrete next step | Scenario and evidence review rubric | Every suggestion is traceable to input data; no invented times or costs |
| Human approval | No local change occurs before explicit approval | Approve and reject checks using local session state | 100%; zero unapproved updates |
| One-call scope | Each analysis action makes one model request | Count model requests in the demo | One request per analysis action. Additional agents and drafting remain stretch. |

## 3. REQUIREMENTS

### Day-3 P0 checklist — the only must-have feature list

User flow — open the sample event, propose an arrival time, request analysis, read the impact report, and approve or reject.

One event and one proposed arrival change

- [P0] Open one seeded event showing event start, vendor arrival, setup duration, and tasks with explicit vendor dependencies.

- [P0] Enter a proposed vendor arrival time and request analysis.

- [P0] Show one AI Planning/Readiness impact report with affected tasks, scheduling_risks, missing facts, and a recommendation alongside the exact overlap calculated by code.

- [P1] User can see the source or seeded-data label for key event facts.

- [P2] User can copy or print the event summary.

Stretch capabilities — outside the day-3 commitment

- Stretch — expanded schedule impact views beyond the single arrival-change report.

- Stretch — a separate Readiness Agent and automatically proposed internal follow-up tasks.

- [P1] User can inspect the event facts and rule behind each finding.

- [P2] User can compare the scenario result with the seeded baseline.

Decision acceptance criteria

- Acceptance — show the current and proposed arrival times before the coordinator decides.

- [P0] Approve or reject the proposed arrival change. Approval updates local session event data. Rejection keeps the original event data.

- Stretch — vendor draft display, copy button, and draft status handling.

- [P1] User can review findings by timeline, task, vendor, or known cost.

### Acceptance and stretch details

The AI report must distinguish supplied facts, calculated values, and missing information.

Report acceptance criteria

- Acceptance — missing arrival or setup values are shown as unknown. Code skips calculations that require missing inputs and the report requests verification.

- Acceptance — malformed output, unknown task IDs, or provider failure shows an error and blocks approval. The coordinator can retry with a new analysis action.

- Stretch — a Vendor Follow-up Agent can draft a message after the core flow is complete.

- [P1] User can see a local record of the proposal, approval decision, and time.

- [P2] User can filter the report by impact category.

Sub-journey: Correct a fact and rerun

- [P1] User can correct the vendor arrival time and rerun the analysis.

- [P1] User can see each agent’s role, evidence, unknowns, and any disagreement.

## 4. APPENDIX

Stack — Next.js with TypeScript and React, Next.js server API route, seeded JSON, browser session state, and the Anthropic API using Claude Opus 4.6 (claude-opus-4-6) with medium effort. Codex is the development tool. Anastasiya confirmed on November 5, 2026 that the team has Anthropic API credits and selected Opus with medium effort. Verify a successful live request using those credits before day-1 integration.

Three-day estimate — 24 team-hours, 12 per person. Day 1: 4 hours each. Crystal prepares the seeded event view and arrival input. Anastasiya defines the single response contract and connects the server route to the provider. Day 2: 4 hours each. Crystal connects exact time arithmetic and the report UI. Anastasiya implements response checks and approve/reject session-state handling. Day 3: 4 hours each. Integrate the full flow, check the three scenarios and invalid-response behavior, fix issues, and prepare the demo. Reuse compatible existing Planning code. Vendor Follow-up and separate Readiness work are deferred.

Source role — https://job-boards.greenhouse.io/aircallioinc/jobs/4470016009. Evidence currently consists of role duties and the illustrative late-vendor scenario. Add a coordinator conversation only after it occurs.

Single AI call — POST /api/analyze receives the seeded event and proposed arrival. Code calculates setup completion and overlap and passes those results with the event facts to one Planning/Readiness prompt. The response includes affected_task_ids, scheduling_risks, unknowns, and recommendation. Preserve the existing Planning output name scheduling_risks. The UI receives the validated report and calculated time result. Each request ends with a report or error.

Local state — one event and one pending proposed arrival in the browser session. Editing the proposed arrival clears the old report and requires fresh analysis. Disable approve/reject while analysis is pending. Approval applies the arrival once and clears the pending proposal. Rejection clears the pending proposal. States are idle, analyzing, review-ready, error, approved, and rejected. Persisted history and version-conflict controls are stretch.

Basic checks — require a valid arrival time and a structured response with only known task references. A failed request or invalid response shows a recoverable error and blocks approval. The user may request analysis again. Keep the API key on the server. Use synthetic event data and treat vendor notes as untrusted input.

Stretch backlog — separate specialist agents, vendor message drafting and copying, stale-version controls, persisted audit records, known-cost calculations, print/export, filters, baseline comparison, and expanded adversarial tests. Prioritize these only after the four P0 capabilities pass the day-3 demo.

Demo checks — (1) 4 PM arrival plus 90-minute setup for a 6 PM event finishes at 5:30 PM and shows no event-start overlap. (2) 5 PM arrival finishes at 6:30 PM and shows a 30-minute overlap. The report identifies only tasks with supplied vendor dependencies. (3) Missing arrival or setup information stays unknown and prompts verification. For each valid case, approve changes the local arrival and reject preserves it. An invalid response or provider failure blocks approval and shows an error.

## 5. Current planning extension for team review (November 11)

The original P0 arrival-change flow above remains the baseline. The current
branch also offers the coordinator a wider planning path: enter an event budget
and guest count, review up to three venue suggestions, choose a venue, review a
vendor group or make selections manually, set dates and times, inspect the
calendar and conflict findings, then read one planning report. AI suggestions
never book a vendor or alter the saved plan without the coordinator's action.

The recommendation request includes the chosen venue and current vendor
choices that are still in the loaded directory before other records. It uses at most 15 listings per service
and 120 records overall. A selected vendor missing from the loaded directory
does not disappear from the plan. The coordinator can still set its time,
remove it, or look for a replacement; the API gives a specific correction
message if a stale selected ID reaches the server. A listing already chosen is
identified as such in search results.

The coordinator enters one budget per selected vendor category: the amount
planned to spend. The same amount appears in the suggested group, chosen plan,
and report. Planned spend sums budgets for selected vendors; proposed choices
do not enter the saved total until chosen. Listing prices are
comparison points and never silently added to that total. A selected vendor
without a budget is called out, and a budget below a known listed starting
price prompts a check. An unfinished number such as `500.` does not count.
Older saved vendor estimates fill empty category budgets when opened. Service
warnings use the category's readable name. Fictional
calendar examples remain in the user's event month and do not occupy the
event's own date. They are never written into the saved plan or its conflict
checks. These extension behaviors are covered by tests and remain subject to
team and instructor review.
