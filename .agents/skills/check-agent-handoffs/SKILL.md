---
name: check-agent-handoffs
description: Review Event Horizon agent handoffs against its PRD and shared contracts. Use when checking Planning, Readiness, Vendor Follow-up, orchestration, evidence references, or approval boundaries before integration.
---

# Check agent handoffs

Review the actual path from event snapshot to agent outputs, vendor draft, and approved local updates. Locate the earliest broken boundary and report evidence that a collaborator can inspect.

## Establish the review scope

Read repository instructions, the current PRD, shared input/output schemas, role prompts, orchestrator entrypoints, validators, approval handler, and relevant tests or run records. Record the reviewed branch and commit. Use the current agreed contracts for exact field names. Flag contradictions between code and requirements.

Read the repository PRD snapshot at [docs/PRD.md](../../../docs/PRD.md). The live source is https://docs.google.com/document/d/1eqek1tXTcvPv9cgyvkWScJjRMRW4HO3Phi-A7GKCodc/edit. Identify which version the review uses.

If that document is unavailable, identify which supplied contract or requirements snapshot the review uses. Label requirements that remain unverified.

Crystal's proposed input/output format must be inspected before declaring cross-agent compatibility. Agreement in prose alone cannot establish that two schemas interoperate.

## Map the boundaries

Trace these transitions through their normal callers.

1. Coordinator's proposed arrival change reaches the orchestrator.
2. The orchestrator creates a run ID and freezes the event ID and snapshot version.
3. Planning and Readiness receive the same read-only snapshot and proposed change in parallel.
4. Their outputs pass schema, identity, evidence-reference, and semantic validation.
5. Application code calculates exact timing overlaps and known-cost arithmetic.
6. Relevant validated findings and known facts reach Vendor Follow-up when its trigger qualifies.
7. Validated findings and allowlisted proposals reach the human review screen.
8. Explicit approval applies the batch against the same event version and records the decision.

For each transition inspect the producer, payload, receiver, enforcing validator, and failure route. Match actual values and versions when run artifacts exist. Keep source inspection and observed runtime evidence distinguishable.

## Check the Event Horizon contract

### Shared input and role ownership

- All role calls belong to the same run, event, and frozen snapshot version. Planning and Readiness use compatible evidence field identifiers.
- The proposed arrival time is staged for analysis. Canonical event data changes through the approval handler.
- The orchestrator owns canonical state. Agents have read-only inputs and no tools or write access.
- Planning returns affected task IDs, timing risks, evidence, unknowns, and recommendations.
- Readiness returns readiness gaps, proposed internal follow-up tasks, evidence, and unknowns.
- Preserve role attribution. Planning schedule recommendations and Readiness follow-up tasks remain distinguishable during aggregation and deduplication.
- Confirm actual call inputs and access boundaries where observable. A prompt saying read-only is only prompt-level enforcement.

### Validation and grounding

- Validate outputs before aggregation, downstream calls, display as verified findings, or application.
- Resolve event, task, vendor, and evidence references against the frozen snapshot. Reject invented IDs, references from another version, and unsupported claims.
- Check evidence meaning as well as reference existence. A valid field ID can still fail to support a claim.
- Missing or conflicting times, costs, and confirmations remain unknown.
- Exact arithmetic comes from code. Check calculated values independently.
- Treat vendor notes and other free text as untrusted data. Keep credentials server-side and out of model payloads, browser output, and logs.
- Escape generated content through the UI's normal rendering path.

### Conditional vendor handoff

- Invoke Vendor Follow-up at most once after both analysis responses pass validation.
- Code detects a vendor question when arrival is unknown, arrival plus setup overlaps a run-of-show item, or Readiness reports a validated gap for that vendor.
- For multiple qualifying vendors choose the earliest affected run-of-show item. Break ties, or choose among vendors with no affected item, by vendor ID.
- Pass relevant validated findings and known facts. Preserve the snapshot and evidence identity through the handoff.
- Accept a grounded no-draft result. Validate draft vendor ID, source references, times, costs, and commitments.
- Present the message as a draft for manual copying outside the approval batch.

### Failure and approval boundaries

- Malformed JSON, unknown IDs, disagreement, and provider failure prevent partial application.
- If Planning or Readiness fails, skip Vendor Follow-up and route the run to human review or failure as required.
- If drafting alone fails, retain validated analysis, flag the draft failure, and block approval until a rerun or explicit acknowledgment.
- Respect the MVP's one-shot calls and absence of automatic retries or agent loops.
- Approval applies only allowlisted local changes after an explicit human decision. Reject stale versions and require a fresh analysis.
- Verify batch consistency under partial failure, repeat submission, and concurrent event changes when implementation exists.
- Rejection preserves canonical event data and removes the draft from the review screen. The local audit retains draft text, vendor ID, and batch decision.
- Audit records connect run ID, snapshot version, role status, validation result, proposal, and reviewer decision/time.

## Verify with relevant cases

Prefer existing offline fixtures and tests. Inspect whether they enter through the real orchestrator and approval paths. Add or run a targeted regression only when needed for an identified gap and within the requested scope.

- Normal event at 6 PM, arrival at 4 PM, setup of 90 minutes yields no conflict and no unnecessary vendor call.
- Arrival at 5 PM yields a 30-minute overlap, affected tasks, and at most one grounded draft for the correct vendor.
- Missing arrival with an instruction-like vendor note remains unknown and produces a verification follow-up.
- Malformed output or an invented task ID routes to review.
- Provider timeout preserves the event and routes to failure.
- Invalid draft vendor ID or unsupported time drops and flags the draft while retaining validated analysis.
- Across cases check the approval gate, rejection behavior, stale-version handling, and role separation.

Record checks as pass, fail, or unverified. Missing implementation or unavailable run evidence is unverified. Inspect enforcing call sites before crediting a validator or test. Live provider calls require task authorization.

## Deliver the review

Provide a compact boundary map and actionable findings with file/line or artifact references. For each finding state the expected contract, observed mismatch, consequence, and smallest correction. Identify the first supported divergence and which later effects follow from it.

State what was reviewed and what checks ran. Distinguish design requirements, implemented controls, test coverage, and observed execution. If only documentation exists, deliver a contract review and identify the evidence needed for runtime verification.

When implementation changes are requested, use a feature branch based on develop and prepare a pull request into develop for collaborator review. Follow the project's separate review and promotion step from develop into main. A handoff review itself grants no permission to merge or send messages.

