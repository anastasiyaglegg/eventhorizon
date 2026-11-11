# Event Horizon PRD

Source: https://docs.google.com/document/d/1eqek1tXTcvPv9cgyvkWScJjRMRW4HO3Phi-A7GKCodc

Status snapshot updated November 11, 2026. The Google Doc is the working PRD. PRs #10 and #11 have merged into develop. PR #13 remains open for review.

Event Horizon — AI EVENT READINESS & TASK AUTOMATION

Product Requirements Document: Net New Build

Build name:  Event Horizon — AI Event Readiness and Task Automation MVP

Development tool — Crystal and Anastasiya use OpenAI Codex to help write, debug, and review the application code. The app’s AI analysis runs through the Anthropic Claude API.

Owners:  Crystal Watson and Anastasiya Glegg

Date: November 10, 2026 — updated to reflect current build and work in review

## 1. PROBLEM

When a vendor arrives late, an event coordinator must work out whether setup will finish before the event starts, identify dependent tasks, and decide what to adjust. A missed dependency can leave a room unready when guests arrive. Event Horizon supports this specific arrival-change decision for one event.

#### Concrete late-vendor scenario

- Illustrative scenario for the demo. Doors open at 6 PM. Catering needs 90 minutes to set up. Its arrival changes from 4 PM to 5 PM. Setup now ends at 6:30 PM, leaving a 30-minute overlap with the event.

- The coordinator needs to see the overlap, identify tasks that depend on catering being ready, and review a suggested next action before accepting the arrival change.

- The Aircall listing grounds the role in vendor coordination and run-of-show work. This scenario is a concrete design example. No coordinator interview has been conducted or quoted. Before resubmission, a short conversation with one coordinator can provide supporting evidence if available.

### 1a. Opportunity

Help a coordinator assess one vendor arrival change through one AI impact report and a clear approve or reject decision.

#### Market Opportunity

- Original three-day estimate was 24 team-hours. The current working target is approximately 16 hours per person, with additional time possible; prioritize the core flow and reviewed extensions.

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

- Keep the four P0 capabilities in section 3 working while reviewing and integrating the expanded vendor workflow.

#### Non-Goals

- Outside the current core: a separate Readiness Agent, Vendor Follow-up Agent and message sending, cost analysis, persistent audit history, multiple saved events, and external calendar synchronization. The optional Recovery Agent and vendor workflow are implemented on develop. Local event creation is proposed in PR #13.

- The seeded core and vendor extension are on develop. The expanded calendar and theme experience is in PR #13; its assessed scope still needs team and instructor agreement. Messaging and calendar synchronization remain outside the current build.

### 2d. Success Metrics

| Goal | Signal | Metric | Target |
| --- | --- | --- | --- |
| Useful impact report | Affected dependent tasks and missing facts match the supplied event | Three demo cases and one invalid-response check | Normal, late, and missing-information cases behave as specified. Invalid responses block approval. |
| Grounded AI recommendations | Suggestions cite event facts and propose a concrete next step | Scenario and evidence review rubric | Every suggestion is traceable to input data; no invented times or costs |
| Human approval | No local change occurs before explicit approval | Approve and reject checks using local session state | 100%; zero unapproved updates |
| Core call scope | The seeded arrival analysis makes one model request | Count model requests in the demo | The seeded arrival analysis uses one call; optional Recovery and the vendor schedule review use separate agent calls. |

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

- Expanded vendor schedule analysis merged into develop with PR #10. PR #13 proposes a visual calendar, a conflict view, and revised setup windows.

- Recovery follow-up drafts are implemented on develop; a separate Readiness Agent remains deferred.

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

### 3a. Current build and expanded vendor workflow — November 11, 2026

**Status.** The seeded arrival review, optional Recovery follow-up drafts, Vendor Finder, schedule rules, and two-agent review are on `develop` after [PR #10](https://github.com/anastasiyaglegg/eventhorizon/pull/10) merged. [PR #11](https://github.com/anastasiyaglegg/eventhorizon/pull/11) merged into `develop` on November 10 and improved the arrival review screen. [PR #13](https://github.com/anastasiyaglegg/eventhorizon/pull/13) adds a theme-led home page and a shared local calendar/conflict workflow; it remains open for review. Lanice’s approval remains separate.

**Vendor Finder.** A separate page searches a Supabase directory of real businesses by category, name, and borough. Official source links are provided when recorded. Demo prices, capacity, and availability are explicitly fictional and must not be used as verified facts. Contact information and reviews may be missing. The vendor chatbot is on hold until Anastasiya requests it.

**Event plan.** A coordinator selects one venue and vendors, enters the event date, start and end, guest count, and each selected vendor’s date and 24-hour time. The venue and selected vendors appear at the top; vendor scheduling shows other scheduled vendors for this event. Overlapping vendor slots and manually entered events are flagged for human review. Confirm access for a vendor on a different venue date. Selections are session-only; they are not confirmed reservations, and no messages are sent.

**Scheduling rules.** On current `develop`, caterers and bakeries start 1–3 hours before the event starts and finish 1–3 hours after it ends. Florists and decorators can start up to 72 hours before; other vendors can start no more than one hour early. PR #13 proposes the team’s newer rule: florist and decorator setup can occur concurrently up to two days before the event, and other vendors can work concurrently but must start at least one hour before it. These PR #13 changes are not yet merged. Slots and events must each start and end on the same date; overnight support is not implemented. Human confirmation is required for venue access, real prices, and availability.

**Agent handoff.** Code validates the schedule and calculates rule violations. Planning prioritizes those findings; when there are findings, Recovery proposes limited, issue-linked next steps. Outputs and issue references are validated. Edits invalidate pending results. The agents do not approve changes, reserve vendors, or send messages. A live local check found a caterer arriving 30 minutes early and produced a recovery suggestion; broader scenarios and deployed testing remain.

**Next important work.**

1. Review open PR #13, resolve findings, and merge only with Anastasiya’s instruction.
2. Run the core and vendor flows together from updated `develop`, including normal, boundary, missing-data, and failure cases; verify the connected database and Anthropic configuration without exposing keys.
3. Decide with the team whether the expanded scope is part of the assessed MVP and submit the revised PRD to Lanice.
4. Review PR #13’s theme picker, calendar, local event add/cancel, and conflict screen. These plans are saved only in the browser session; they are not external bookings or synchronized calendar events. Notification email was removed from scope at Anastasiya’s request.
5. Open a separate `develop`-to-`main` PR when the team is ready for release.

## 4. APPENDIX

Stack — Next.js with TypeScript and React, Next.js server API routes, seeded JSON, a Supabase vendor directory, browser session state, and the Anthropic API using Claude Opus 4.6 (claude-opus-4-6) with medium effort. Codex is the development tool. Anastasiya confirmed on November 5, 2026 that the team has Anthropic API credits and selected Opus with medium effort. A live local arrival analysis and one vendor schedule handoff have succeeded; deployed-environment verification remains outstanding.

Original three-day estimate — 24 team-hours, 12 per person; historical estimate, superseded by the current approximately 16-hours-per-person working target where feasible. Day 1: 4 hours each. Crystal prepares the seeded event view and arrival input. Anastasiya defines the single response contract and connects the server route to the provider. Day 2: 4 hours each. Crystal connects exact time arithmetic and the report UI. Anastasiya implements response checks and approve/reject session-state handling. Day 3: 4 hours each. Integrate the full flow, check the three scenarios and invalid-response behavior, fix issues, and prepare the demo. Reuse compatible existing Planning code. Vendor Follow-up and separate Readiness work are deferred.

Source role — https://job-boards.greenhouse.io/aircallioinc/jobs/4470016009. Evidence currently consists of role duties and the illustrative late-vendor scenario. Add a coordinator conversation only after it occurs.

Core arrival analysis — POST /api/analyze receives the seeded event and proposed arrival. Code calculates setup completion and overlap and passes those results with the event facts to one Planning/Readiness prompt. The response includes affected_task_ids, scheduling_risks, unknowns, and recommendation. Preserve the existing Planning output name scheduling_risks. The UI receives the validated report and calculated time result. Each request ends with a report or error.

Local state — one event and one pending proposed arrival in the browser session. Editing the proposed arrival clears the old report and requires fresh analysis. Disable approve/reject while analysis is pending. Approval applies the arrival once and clears the pending proposal. Rejection clears the pending proposal. States are idle, analyzing, review-ready, error, approved, and rejected. Persisted history and version-conflict controls are stretch.

Basic checks — require a valid arrival time and a structured response with only known task references. A failed request or invalid response shows a recoverable error and blocks approval. The user may request analysis again. Keep the API key on the server. Use synthetic event data and treat vendor notes as untrusted input.

Future backlog — vendor message drafting and copying, persistent event plans and audit records, permission controls, real calendar integration, overnight schedules, known-cost calculations, print/export, and expanded evaluations. The vendor chatbot is on hold. Automatic booking email was removed from scope. Review priorities with Crystal and Lanice.

Demo checks — (1) 4 PM arrival plus 90-minute setup for a 6 PM event finishes at 5:30 PM and shows no event-start overlap. (2) 5 PM arrival finishes at 6:30 PM and shows a 30-minute overlap. The report identifies only tasks with supplied vendor dependencies. (3) Missing arrival or setup information stays unknown and prompts verification. For each valid case, approve changes the local arrival and reject preserves it. An invalid response or provider failure blocks approval and shows an error.
