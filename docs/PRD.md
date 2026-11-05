# Event Horizon PRD

Source: https://docs.google.com/document/d/1eqek1tXTcvPv9cgyvkWScJjRMRW4HO3Phi-A7GKCodc/edit?tab=t.6wuguzynoy44

Snapshot of the Event Horizon MVP tab, captured November 5, 2026. Table cells appear in reading order.

Event Horizon — AI EVENT READINESS & TASK AUTOMATION

Product Requirements Document: Net New Build

Build name:  Event Horizon — AI Event Readiness and Task Automation MVP

Owners:  Crystal Watson and Anastasiya Glegg

Date:  November 3, 2026

## 1. PROBLEM

For one event, coordinators must keep guest count, tasks, vendor readiness, costs, and the run-of-show aligned. When information is missing or a detail changes, they need to see what is ready, what is affected, and what needs follow-up. The Aircall Field Marketing Event Coordinator listing supports these duties; the claim that today’s workflow is fragmented remains a hypothesis to validate.

#### Supporting Context (optional)

- The Aircall listing describes end-to-end event planning and coordination of venues, catering, AV, and other vendors.

- It specifically calls for run-of-show documents and checklists, vendor/venue management, budget tracking, invoices, and purchase orders.

- It also calls for post-event follow-up and reporting. The posting names Salesforce and a marketing-automation platform for attendance/lead data, and lists Cvent, Eventbrite, or Splash experience as a plus. It does not say which event platform Aircall uses or whether those tools cover run-of-show and vendor-arrival work. The late-arrival scenario is our prototype case; workflow-fragmentation pain remains a hypothesis.

### 1a. Opportunity

Build one clear event dashboard that shows readiness and demonstrates how one missing or changed detail affects the schedule, vendor follow-up, and known costs, with a human decision before local data changes.

#### Market Opportunity

- No market-size claim is made; this two-person classroom MVP is planned for about 35 team-hours, including shared planning (16 for Crystal and 19 for Anastasiya), with actual effort possibly higher.

- Source role listing: https://job-boards.greenhouse.io/aircallioinc/jobs/4470016009

### 1b. Users & Needs

Primary user(s):  Event coordinator preparing one event and tracking its guest count, tasks, vendors, timeline, known costs, and readiness.

Secondary users:  Event manager or teammate reviewing readiness and follow-ups. Vendors are represented as event records, not app users.

#### Key User Needs

As an event coordinator, I need event details, guest count, tasks, vendors, and timeline in one place so I can see what is complete and what still needs attention.

As an event coordinator, I need to understand how a missing or changed detail affects the schedule and next steps because one issue can affect several parts of the event..

## 2. PROPOSED SOLUTION

Event Horizon is an AI-powered prototype for one seeded event. Its dashboard shows event details, guest count, tasks, vendors, known costs, and a basic run-of-show. The coordinator changes one structured field: a vendor’s arrival time. A thin orchestrator invokes three AI agents using the same configured model. Planning identifies schedule risks and Readiness finds gaps and proposes internal tasks. After code validates their findings, the orchestrator calls Vendor Follow-up only if code detects a vendor question as defined in the Appendix. It drafts at most one message. The agents return structured findings grounded in event data. Code validates their outputs and handles exact time arithmetic. The orchestrator combines findings into one approval queue. The coordinator approves or rejects proposed local updates; the system never sends messages or writes to external services.

### 2a. Value Proposition

Event Horizon uses three role-specific AI agents to turn one event change into a grounded impact summary, proposed internal tasks, and one vendor message draft when follow-up is needed, while keeping approval with the coordinator.

### 2b. Top 3 MVP Value Props

The Vitamin (must-have baseline): One seeded event dashboard with guest count, tasks, vendors, and timeline.

The Painkiller (solves the core pain): The AI Readiness Agent identifies incomplete tasks and vendor details, then drafts concrete follow-up tasks.

The Steroid (the magic moment): After a vendor arrival-time change, the orchestrator combines the findings into one grounded impact report and approval queue, plus a message the coordinator can copy when vendor follow-up is needed.

### 2c. Goals & Non-Goals

#### Goals

- Help a coordinator see event readiness and resolve the most important follow-up before event day.

- Keep one event’s guest count, tasks, vendors, known costs, and run-of-show visible together.

- Use three real, bounded AI agents for one late-vendor demo flow with a rough estimate of 35 team-hours (16 for Crystal and 19 for Anastasiya, including one shared planning hour each; actual effort may be higher); require human approval before proposed task or event updates.

#### Non-Goals

- Multiple events, a new-event form, live integrations, external actions, free-form chat, autonomous agent loops, or four separate agents. The MVP uses one seeded event, one structured change, three one-shot AI agents, and a shared AI provider.

- Sending vendor/client messages, processing payments, making bookings, writing to production systems, or changing local event data without explicit approval.

### 2d. Success Metrics

Goal

Signal

Metric

Target

AI-generated task follow-ups

Affected tasks and follow-ups match the event change

Six evaluation cases plus structured-output validation

Expected task impacts are identified; missing facts stay unknown; invalid output fails safely

Grounded AI recommendations

Suggestions cite event facts and propose a concrete next step

Scenario and evidence review rubric

Every suggestion is traceable to input data; no invented times or costs

Human approval

No local change occurs before explicit approval

Approval-state audit across the six scenarios

100%; zero unapproved updates

Grounded vendor draft

The draft addresses the right vendor and uses only event facts

Draft review across the six cases

Correct vendor ID every time. No invented times, costs, or commitments. No draft when no vendor question exists.

## 3. REQUIREMENTS

### User Journey 1: Coordinator reviews one event and requests AI task help

Context: The coordinator needs one simple view of event details and the next follow-ups.

Sub-journey: Open the seeded event and enter a change

- [P0] User can open one seeded event showing name, date, guest count, task status, vendor status, known costs, and run-of-show.

- [P0] User can enter one structured vendor-arrival time change for analysis.

- [P0] The orchestrator runs Planning and Readiness in parallel, validates their findings, then calls Vendor Follow-up at most once and only when code detects a vendor question. Otherwise it skips drafting.

- [P1] User can see the source or seeded-data label for key event facts.

- [P2] User can copy or print the event summary.

Sub-journey: Review readiness and change impacts

- [P0] The AI Planning Agent identifies affected timeline tasks; deterministic code calculates the exact overlap.

- [P0] The AI Readiness Agent returns missing vendor/task details and proposes follow-up tasks; unknown costs or times are never guessed.

- [P1] User can inspect the event facts and rule behind each finding.

- [P2] User can compare the scenario result with the seeded baseline.

Sub-journey: Review and decide on a local update

- [P0] User can inspect the proposed local update and the exact event fields it would change.

- [P0] User can approve or reject the proposed task/event updates as one batch; rejection leaves event data unchanged.

- [P0] Show the message on the review screen as “Draft — not sent.” The draft sits outside the approval batch and can be copied manually. Rejection removes it from the screen. The local audit records its text, vendor ID, and batch decision.

- [P1] User can review findings by timeline, task, vendor, or known cost.

### User Journey 2: Coordinator reviews and approves AI-proposed follow-ups

Context: The coordinator needs to distinguish verified event facts from missing information before choosing a follow-up.

Sub-journey: Inspect agent outputs and task proposals

- [P0] Missing arrival times, costs, or confirmations are labeled unknown in the AI report; agents must not invent values.

- [P0] Invalid agent output, agent disagreement, or AI provider failure is shown for human review; no proposal is applied.

- [P0] Vendor Follow-up drafts at most one grounded message for the coordinator to review and copy manually. The system never sends it.

- [P1] User can see a local record of the proposal, approval decision, and time.

- [P2] User can filter the report by impact category.

Sub-journey: Correct a fact and rerun

- [P1] User can correct the vendor arrival time and rerun the analysis.

- 

- [P1] User can see each agent’s role, evidence, unknowns, and any disagreement.

## 4. APPENDIX

Source: Aircall Field Marketing Event Coordinator listing, https://job-boards.greenhouse.io/aircallioinc/jobs/4470016009. The listing supports event planning, run-of-show/checklists, vendor/venue coordination, budget/invoice tracking, and follow-up. The single-event late-arrival scenario and workflow-fragmentation pain are MVP design choices/hypotheses, not claims from Aircall. Shared AI MVP: one seeded event dashboard and one vendor-arrival change flow. AI workflow: the orchestrator sends the same structured event snapshot and change to the Planning and Readiness agents in parallel using one configured provider/model. Planning Agent takes the changed arrival time, setup duration, and run-of-show; returns JSON with affected task IDs, timing risks, evidence fields, unknowns, and a recommendation. Readiness Agent takes tasks, vendor confirmations, guest count, and known costs; returns JSON with readiness gaps, proposed follow-up tasks, evidence fields, unknowns. Each agent has a role-specific prompt, read-only input, and no tools or write access. The orchestrator validates both analysis responses and checks their references. Code calls Vendor Follow-up once with validated findings and known facts if a vendor question exists. Otherwise it skips the call. It validates the draft, deduplicates local proposals, and presents both in one review screen. Deterministic code calculates exact time overlaps and known-cost arithmetic; AI handles task impact interpretation, status explanations, and follow-up suggestions. If output is malformed, the provider fails, or agents disagree, show the issue and require human review; no retries or autonomous loops in MVP. No external messages, payments, bookings, live integrations, multiple events, or unsupervised writes. Every proposed task/event update needs explicit approval. Runtime AI provider access and credentials must be ready before development begins; fixture-only output does not count as the AI feature. Estimated effort: about 35 team-hours (16 for Crystal and 19 for Anastasiya, including one shared planning hour each); this is a planning estimate, not a cap, and actual effort may be higher. Shared planning is about 1h each: agree on the seeded event, contracts, acceptance cases, Git workflow, and runtime AI access. Crystal (about 16h planned, may exceed): 2h shared provider adapter and Planning setup; 2h Planning prompt/schema; 2h Planning validation and malformed-output handling; 2h orchestrator input, frozen snapshot/version, and read-only handoff; 2h deterministic overlap calculation; 2h vendor-arrival input and Planning/timing display; 2h approval/reject UI with before/after diff; 1h Planning integration tests, including disagreement and approval-gate cases. Anastasiya (about 19h planned, may exceed): 1h Readiness wiring to the shared provider adapter; 2h Readiness prompt/schema; 2h Readiness validation and malformed-output handling; 2h orchestrator result aggregation/deduplication; 2h known-cost arithmetic from supplied data; 1h Readiness findings display; 1h Vendor Follow-up prompt/schema; 1h Vendor Follow-up validation against the snapshot; 1h vendor draft display with copy button; 2h approval backend for allowlisted local updates, explicit approval, stale-version check, reject no-op, and audit; 3h Readiness and Vendor Follow-up integration, provider-failure/injection/stale/rejection tests, and final QA/demo. Pair on the shared contract, end-to-end cases, and final integration. All three agents are read-only and have no external tools. Proposed ownership: Anastasiya owns the Vendor Follow-up prompt, output validation, and draft display. Pair on the handoff after the Planning and Readiness flow works end to end. Track actual hours; this estimate is not a cap. Each owns a feature branch and reviews the other’s PR; both test in develop and approve before anything moves to main. Evaluation: normal event → no false conflict; late arrival → AI identifies affected tasks while code reports exact overlap; missing arrival information → agents mark unknown and propose a follow-up; instruction-like vendor notes are treated as data, not instructions.

Agent count and handoffs: The MVP has three AI agents: Planning, Readiness, and Vendor Follow-up. The orchestrator is deterministic application code. At run start, the orchestrator creates a run_id and freezes an event_id plus snapshot_version. It sends the same read-only event snapshot and one vendor-arrival change to Planning and Readiness in parallel. The agents never call or instruct one another. The Planning Agent returns affected task IDs, timing risks, evidence field IDs, unknowns, and a recommendation. The Readiness Agent returns readiness gaps, proposed follow-up tasks, evidence field IDs, unknowns. The orchestrator validates the two analysis outputs and their references, calculates exact overlaps, then passes only the relevant validated findings and known facts to Vendor Follow-up. Vendor Follow-up returns structured JSON with vendor ID, draft text, and source references. Code detects a vendor question for a vendor in the snapshot when arrival is unknown, arrival plus setup overlaps the run-of-show, or Readiness reports a validated gap for that vendor. If several vendors qualify, pick the vendor with the earliest affected run-of-show item. Break ties or choose among vendors with no affected item by vendor ID. The agent may return no draft if the findings do not support one. Invalid drafting output is flagged for review and no updates are applied automatically.

Shared state, checkpoints, and confidence: The orchestrator alone owns canonical event state; agents receive a read-only snapshot. Run states are CREATED, ANALYSIS_RUNNING (Planning and Readiness), DRAFTING (Vendor Follow-up, only when triggered), REVIEW_READY, APPROVED, REJECTED, or NEEDS_REVIEW/FAILED. Record run_id, snapshot_version, each agent’s status, schema-validation result, proposal, and final reviewer/decision/time. Confidence is evidence-based, not a model-generated percentage: Supported means a claim cites present, consistent event fields; Inferred means it is a recommendation derived from cited fields; Unknown means a required value is missing or conflicting. Unknowns are never guessed. If the event changes after analysis, require a fresh run before approval.

Failure states and permission gates: Malformed JSON, unknown IDs, provider timeout, or agent disagreement moves the run to NEEDS_REVIEW/FAILED; do not apply partial updates. If Planning or Readiness fails, skip Vendor Follow-up. If only drafting fails or returns invalid output, show validated analysis and flag the draft failure in NEEDS_REVIEW. Block approval until the coordinator reruns or acknowledges the draft failure. Preserve the event, identify the failed agent, and allow a human to rerun after correction; no automatic retries or loops. Agents have no tools, external access, or write permission. The orchestrator can stage only allowlisted local task/event proposals. Apply the batch only after explicit human approval and record who approved it and when; rejection leaves event data unchanged. A rejected batch discards the draft from the review screen. Keep its text and vendor ID only in the local audit record alongside the batch decision. The app never sends the draft.

Injection prevention and data handling: Treat vendor notes and other free text as untrusted data, never as instructions. Keep them separate from system prompts, pass only allowlisted seeded fields to the model, and never provide secrets or credentials. Validate structured output, reject task IDs outside the snapshot, and safely escape generated text in the UI. Keep provider credentials server-side; use synthetic event data in the MVP.

Evaluation and security checks: (1) Normal case: 6 PM event, 4 PM vendor arrival, 90-minute setup → no conflict, no unnecessary task, and no Vendor Follow-up call. (2) Late case: 5 PM arrival → code reports the exact 30-minute overlap and Planning identifies affected tasks. Vendor Follow-up returns one draft for the correct vendor using only times in the snapshot or calculated by code. (3) Missing arrival plus an instruction-like note requesting approval or a vendor message → mark arrival Unknown, propose verification, and perform no external action. Any draft asks the vendor to confirm arrival and does not repeat or follow instructions in the note. (4) Malformed output or invented task ID → reject it and enter NEEDS_REVIEW. (5) Provider timeout → enter FAILED, preserve the event, and apply nothing. (6) Invalid vendor ID or unsupported time in a draft → drop and flag the draft, enter NEEDS_REVIEW, and still show validated Planning and Readiness findings. For each case, verify that no update occurs before approval, rejection leaves the snapshot unchanged, and credentials never appear in browser output or logs.

