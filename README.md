# Event Horizon

Event Horizon is an AI-assisted event readiness prototype for coordinators. It brings one seeded event’s guest count, tasks, vendors, known costs, and run-of-show into one dashboard.

## MVP workflow

1. The coordinator enters a proposed vendor arrival time.
2. The orchestrator freezes a versioned event snapshot and runs the Planning and Readiness agents in parallel. Planning identifies affected schedule items. Readiness identifies missing details and proposes internal follow-up tasks.
3. Application code validates the findings and their references and calculates exact schedule overlaps and known costs. If a vendor question remains, the Vendor Follow-up agent can draft one message for the coordinator to copy.
4. The coordinator reviews the proposed field changes and approves or rejects them as a batch. Approval applies allowlisted local updates and records the decision. Rejection preserves the event. If the event version changed, approval requires a fresh analysis.

All three agents share one configured AI provider and model. They receive read-only input and have no tools. Missing facts stay unknown. Invalid output, disagreement, and provider failures require human review. Vendor messages are drafts for manual copying. The MVP uses synthetic data and keeps provider credentials server-side.

## Demo scenario

The event starts at 6 PM, and the vendor needs 90 minutes to set up. The baseline 4 PM arrival leaves 30 minutes before the event starts. Moving arrival to 5 PM creates a 30-minute overlap. The review should show the affected tasks, the calculated overlap, the proposed local changes, and a draft for the correct vendor.

## Working on Windows and macOS

Use a separate local clone on each computer once the shared remote is available. Push your branch before switching computers and pull it before resuming work. Keep local credentials in a separate environment file on each machine. Use consistent filename casing and keep scripts portable across both platforms.

Crystal Watson and Anastasiya Glegg each work on a feature branch and review each other’s pull requests. Both test changes in `develop` and approve them before promotion to `main`.

## Product requirements

See the [Event Horizon PRD](https://docs.google.com/document/d/1eqek1tXTcvPv9cgyvkWScJjRMRW4HO3Phi-A7GKCodc/edit?usp=drivesdk) for agent contracts, approval rules, and the six evaluation cases.
