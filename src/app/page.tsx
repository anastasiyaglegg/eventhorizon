"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analysisInputSchema } from "../lib/contract";
import { requestAnalysis } from "../client/analysis-api";
import { requestRecovery } from "../client/recovery-api";
import type { RecoveryOutput } from "../lib/recovery-contract";
import { chooseRecoveryTask, clearRecoveryTaskDecisions, recoveryTaskDecisionKey, type RecoveryTaskDecision, type RecoveryTaskDecisions } from "../lib/recovery-review";
import {
  beginAnalysis,
  clearProposal,
  createSession,
  decide,
  failAnalysis,
  receiveAnalysis,
  type EventSession,
} from "../lib/session";
import {
  buildAnalysisInput,
  clockToInput,
  dependentTasks,
  formatClock,
  formatMinutes,
  normalizeArrivalInput,
} from "../lib/review";

type ApiErrorPayload = {
  error?: { message?: string };
};

function safeErrorMessage(payload: ApiErrorPayload | null): string {
  return payload?.error?.message || "Analysis could not finish. Please retry.";
}

export default function Home() {
  const [session, setSession] = useState<EventSession | null>(null);
  const [arrivalInput, setArrivalInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryPlan, setRecoveryPlan] = useState<RecoveryOutput | null>(null);
  const [recoveryDecisions, setRecoveryDecisions] = useState<RecoveryTaskDecisions>({});
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const recoveryRequestRef = useRef(0);
  const analysisRequestRef = useRef(0);
  const recoveryAbortRef = useRef<AbortController | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  function cancelRecovery() {
    recoveryRequestRef.current++;
    recoveryAbortRef.current?.abort();
    recoveryAbortRef.current = null;
    setRecoveryBusy(false);
    setRecoveryPlan(null);
    setRecoveryDecisions(clearRecoveryTaskDecisions());
    setRecoveryError(null);
  }

  function cancelAnalysis() {
    analysisRequestRef.current++;
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    setBusy(false);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/event", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(safeErrorMessage(payload));
        return analysisInputSchema.parse(payload);
      })
      .then((input) => {
        if (cancelled) return;
        setSession(createSession(input.snapshot.event));
        setArrivalInput(clockToInput(input.snapshot.proposed_change.proposed_arrival_time));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("The seeded event could not be loaded. Please refresh and retry.");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const event = session?.event;
  const review = session?.review;
  const dependent = useMemo(
    () => (event ? dependentTasks(event) : []),
    [event],
  );
  const currentArrival = event?.vendor.arrival_time ?? null;
  const pendingArrival = session?.pending?.arrival;
  const canReview = session?.status === "review-ready" && review !== null;
  const canApprove = canReview && pendingArrival != null;

  useEffect(() => {
    if (session?.status === "review-ready") resultsRef.current?.focus();
  }, [session?.status]);

  function updateArrival(value: string) {
    cancelRecovery();
    cancelAnalysis();
    setArrivalInput(value);
    setInputError(null);
    setSession((current) => current ? clearProposal(current) : current);
  }

  async function analyzeProposal() {
    if (!session) return;
    let proposedArrival: string | null;
    try {
      proposedArrival = normalizeArrivalInput(arrivalInput);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "Enter a valid arrival time.");
      return;
    }

    cancelRecovery();
    cancelAnalysis();
    const analysisToken = analysisRequestRef.current;
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    const requestId = crypto.randomUUID();
    const pending = beginAnalysis(clearProposal(session), proposedArrival, requestId);
    setSession(pending);
    setBusy(true);
    setInputError(null);

    try {
      const input = buildAnalysisInput(pending.event, proposedArrival);
      const packet = await requestAnalysis(input, controller.signal);
      setSession((current) =>
        current ? receiveAnalysis(current, requestId, packet) : current,
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Analysis could not finish. Please retry.";
      setSession((current) =>
        current ? failAnalysis(current, requestId, message) : current,
      );
    } finally {
      if (analysisToken === analysisRequestRef.current) {
        analysisAbortRef.current = null;
        setBusy(false);
      }
    }
  }

  async function draftRecoveryPlan() {
    if (!session?.review || session.status !== "review-ready" || !session.pending?.requestId) return;
    cancelRecovery();
    const requestToken = recoveryRequestRef.current;
    const controller = new AbortController();
    recoveryAbortRef.current = controller;
    setRecoveryBusy(true);
    try {
      const result = await requestRecovery({
        contract_version: "recovery.v1",
        source_run_id: session.pending.requestId,
        event: session.event,
        proposed_arrival_time: session.review.proposed_arrival_time,
        analysis: session.review.analysis,
      }, controller.signal);
      if (requestToken === recoveryRequestRef.current) {
        setRecoveryPlan(result);
        setRecoveryDecisions(clearRecoveryTaskDecisions());
      }
    } catch (error) {
      if (!controller.signal.aborted && requestToken === recoveryRequestRef.current) {
        setRecoveryError(error instanceof Error ? error.message : "Recovery suggestions could not be created.");
      }
    } finally {
      if (requestToken === recoveryRequestRef.current) {
        recoveryAbortRef.current = null;
        setRecoveryBusy(false);
      }
    }
  }

  function makeDecision(decision: "approve" | "reject") {
    if (!session) return;
    try {
      cancelRecovery();
      cancelAnalysis();
      const next = decide(session, decision);
      setSession(next);
      if (arrivalInput !== "") {
        setArrivalInput(clockToInput(next.event.vendor.arrival_time));
      }
      setInputError(null);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "Decision is unavailable.");
    }
  }

  function decideRecoveryTask(key: string, decision: RecoveryTaskDecision) {
    setRecoveryDecisions((current) => chooseRecoveryTask(current, key, decision));
  }

  if (loading) {
    return <main className="page-shell"><p className="empty-state">Loading the seeded event…</p></main>;
  }

  if (loadError || !event) {
    return <main className="page-shell"><div className="alert">{loadError || "The event is unavailable."}</div></main>;
  }

  const calculation = review?.calculation;
  const analysis = review?.analysis;
  const overlapLabel = calculation?.overlap_minutes === null
    ? "Unknown"
    : calculation && calculation.overlap_minutes > 0 ? "Potential overlap" : "No overlap";
  const overlapTag = calculation?.overlap_minutes === null
    ? "unknown"
    : calculation && calculation.overlap_minutes > 0 ? "warn" : "good";

  return (
    <main className="page-shell">
      <header className="page-heading">
        <div>
          <div className="eyebrow">Event Horizon</div>
          <h1>Review a vendor arrival</h1>
          <p className="subtitle">
            See how an arrival change affects your event, then decide whether to approve it.
          </p>
        </div>
        <span className="status-pill">Sample event</span>
      </header>

      <nav className="review-steps" aria-label="Review steps">
        <span className={session.status !== "review-ready" && session.status !== "approved" && session.status !== "rejected" ? "review-step current" : "review-step"}>1. Enter arrival</span>
        <span className={session.status === "review-ready" ? "review-step current" : "review-step"}>2. Review impact</span>
        <span className={session.status === "approved" || session.status === "rejected" ? "review-step current" : "review-step"}>3. Decide</span>
      </nav>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{event.name}</h2>
            <p className="helper">Sample event · {event.event_date} · {event.time_zone}</p>
          </div>
          <span className="tag good">Local session only</span>
        </div>
        <p className="event-vendor">Vendor: <strong>{event.vendor.name}</strong></p>
        <div className="event-meta">
          <div className="fact"><span className="fact-label">Current vendor arrival</span><span className="fact-value">{formatClock(currentArrival)}</span></div>
          <div className="fact"><span className="fact-label">Setup duration</span><span className="fact-value">{event.vendor.setup_duration_minutes === null ? "Unknown" : `${event.vendor.setup_duration_minutes} minutes`}</span></div>
          <div className="fact"><span className="fact-label">Event starts</span><span className="fact-value">{formatClock(event.start_time)}</span></div>
        </div>
        <h3 style={{ marginTop: 24 }}>Tasks that depend on this vendor</h3>
        <ul className="task-list">
          {dependent.map((task) => (
            <li className="task-item" key={task.task_id}>
              <span><span className="task-name">{task.name}</span></span>
              <span className="task-detail">{formatClock(task.start_time)}–{formatClock(task.end_time)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>1. Enter a proposed arrival</h2>
        <p className="helper" id="arrival-help">Enter 24-hour time in HH:MM format, such as 17:00, using the event’s local time zone. Leave blank if the arrival is unknown.</p>
        <div className="arrival-form">
          <div className="field">
            <label htmlFor="proposed-arrival">Proposed arrival</label>
            <input
              id="proposed-arrival"
              type="text"
              autoComplete="off"
              inputMode="numeric"
              placeholder="17:00"
              maxLength={5}
              aria-describedby="arrival-help"
              value={arrivalInput}
              onChange={(eventChange) => updateArrival(eventChange.target.value)}
              onKeyDown={(eventKey) => { if (eventKey.key === "Enter" && !busy) { eventKey.preventDefault(); void analyzeProposal(); } }}
            />
          </div>
          <button className="secondary-button" type="button" onClick={() => updateArrival("")} disabled={arrivalInput === ""}>
            Clear arrival
          </button>
          <button className="primary-button" type="button" onClick={analyzeProposal} disabled={busy}>
            {busy ? "Analyzing…" : "Analyze impact"}
          </button>
        </div>
        <p className="footnote">Select Analyze impact to check the proposed time before deciding.</p>
        {inputError && <div className="alert" role="alert">{inputError}</div>}
        <div className="comparison">
          <div className="comparison-card"><span className="fact-label">Current arrival</span><span className="fact-value">{formatClock(currentArrival)}</span></div>
          <div className="comparison-card proposed"><span className="fact-label">Proposed scenario</span><span className="fact-value">{arrivalInput ? formatClock(`${arrivalInput}:00`) : "Unknown"}</span></div>
        </div>
      </section>

      {session.status === "error" && <div className="alert" role="alert">{session.error || "The analysis is unavailable. Please retry."}</div>}
      {session.status === "approved" && <div className="success" role="status">Approved locally. The session event now uses {formatClock(event.vendor.arrival_time)}.</div>}
      {session.status === "rejected" && <div className="success" role="status">Rejected locally. The session event still uses {formatClock(event.vendor.arrival_time)}.</div>}

      <div className="review-grid" ref={resultsRef} tabIndex={-1} aria-label="Analysis results">
        <section className="panel result-card">
          <h2>2. Review the timing <span className={`tag ${overlapTag}`}>{calculation ? overlapLabel : "Awaiting analysis"}</span></h2>
          {calculation ? (
            <>
              <div className="metric-grid">
                <div className="metric"><span className="metric-label">Setup completes</span><span className="metric-value">{formatClock(calculation.setup_finish)}</span></div>
                <div className="metric"><span className="metric-label">Event starts</span><span className="metric-value">{formatClock(event.start_time)}</span></div>
                <div className="metric"><span className="metric-label">Event-start overlap</span><span className="metric-value">{formatMinutes(calculation.overlap_minutes)}</span></div>
              </div>
              <h3 style={{ marginTop: 24 }}>Tasks affected</h3>
              {calculation.affected_task_ids.length > 0 ? (
                <ul className="task-list">{calculation.affected_task_ids.map((taskId) => <li className="task-item" key={taskId}><span className="task-name">{event.tasks.find(task => task.task_id === taskId)?.name ?? taskId}</span><span className="task-detail">depends on vendor readiness</span></li>)}</ul>
              ) : <div className="empty-state">No dependent task is calculated as affected.</div>}
              {calculation.unknowns.length > 0 && <><h3 style={{ marginTop: 24 }}>Calculated unknowns</h3><ul className="unknown-list">{calculation.unknowns.map((unknown) => <li className="empty-state" key={unknown}>{unknown}</li>)}</ul></>}
            </>
          ) : <div className="empty-state">Analyze the arrival to see when setup finishes and whether it overlaps the event.</div>}
          <p className="footnote">The app calculates these times from the event details.</p>
        </section>

        <section className="panel result-card">
          <h2>What the planning agent found <span className="tag good">AI review</span></h2>
          {analysis ? (
            <>
              <p className="helper">Review the findings before deciding on the proposed time.</p>
              <h3 style={{ marginTop: 22 }}>Affected tasks</h3>
              {analysis.affected_task_ids.length > 0 ? <ul className="task-list">{analysis.affected_task_ids.map((taskId) => <li className="task-item" key={taskId}><span className="task-name">{event.tasks.find(task => task.task_id === taskId)?.name ?? taskId}</span></li>)}</ul> : <div className="empty-state">The planning agent identified no affected tasks.</div>}
              <h3 style={{ marginTop: 22 }}>Scheduling risks</h3>
              {analysis.scheduling_risks.length > 0 ? <ul className="risk-list">{analysis.scheduling_risks.map((risk, index) => <li className="risk-item" key={`${risk.type}-${index}`}><div className="risk-type">{risk.type === "missing_information" ? "Information needed" : "Possible schedule conflict"}</div><p>{risk.description}</p><details><summary>See supporting details</summary><ul className="evidence-list">{risk.evidence.map((evidence, evidenceIndex) => <li className="evidence-item" key={`${evidence.source}-${evidence.field}-${evidenceIndex}`}>{evidence.source}{evidence.id ? `:${evidence.id}` : ""}.{evidence.field}</li>)}</ul></details></li>)}</ul> : <div className="empty-state">No scheduling risk was identified.</div>}
              <h3 style={{ marginTop: 22 }}>Unknowns</h3>
              {analysis.unknowns.length > 0 ? <ul className="unknown-list">{analysis.unknowns.map((unknown) => <li className="empty-state" key={unknown}>{unknown}</li>)}</ul> : <div className="empty-state">No unknown information was reported.</div>}
              <h3 style={{ marginTop: 22 }}>Recommendation</h3>
              <p>{analysis.recommendation.action}</p>
            </>
          ) : <div className="empty-state">Analyze the arrival to see the planning agent’s findings and recommendation.</div>}
          <p className="footnote">AI findings are interpretation only. They cannot change event data or approve a proposal.</p>
        </section>
      </div>

      <section className="panel">
        <h2>3. Decide on the proposed time</h2>
        <p className="helper">Choose whether to use the proposed arrival in this session.</p>
        <div className="comparison">
          <div className="comparison-card"><span className="fact-label">Current arrival</span><span className="fact-value">{formatClock(currentArrival)}</span></div>
          <div className="comparison-card proposed"><span className="fact-label">Proposed arrival</span><span className="fact-value">{pendingArrival ? formatClock(pendingArrival) : "Unknown"}</span></div>
        </div>
        <div className="decision-row">
          <button className="decision-button approve" type="button" onClick={() => makeDecision("approve")} disabled={!canApprove || busy}>Approve locally</button>
          <button className="decision-button reject" type="button" onClick={() => makeDecision("reject")} disabled={!canReview || busy}>Reject locally</button>
        </div>
        <p className="footnote">{!canReview ? "Analyze a proposed arrival first to enable a decision." : !canApprove ? "The arrival is unknown. Enter a time and analyze it to enable approval." : "Review the impact above, then approve or reject the change."}</p>
      </section>

      <details className="panel recovery-panel">
        <summary>
          <span><span className="eyebrow">Stretch feature</span><strong>Recovery Engine · internal follow-up tasks</strong></span>
          <span className="tag unknown">Optional · stretch feature</span>
        </summary>
        <p className="helper">This optional agent reads the validated report and suggests internal follow-ups. It does not contact vendors or change event data. Suggestions are not saved and need coordinator review.</p>
        <p className="helper recovery-review-note">For each draft, choose whether to keep or dismiss it for this review. These choices stay in this page only; they do not create tasks or contact vendors.</p>
        <button className="secondary-button" type="button" onClick={draftRecoveryPlan} disabled={!canReview || busy || recoveryBusy}>
          {recoveryBusy ? "Drafting follow-ups…" : "Draft follow-up tasks"}
        </button>
        {!canReview && <p className="footnote">Run a successful analysis to enable the Recovery Engine.</p>}
        {recoveryError && <div className="alert" role="alert">{recoveryError}</div>}
        {recoveryPlan && (recoveryPlan.proposed_tasks.length === 0
          ? <p className="empty-state" role="status">No follow-up task was suggested from the current findings.</p>
          : <>
            <p className="helper" role="status">Draft suggestions · review before acting · run {recoveryPlan.run_id}</p>
            <ul className="task-list">{recoveryPlan.proposed_tasks.map((task, index) => {
              const decisionKey = recoveryTaskDecisionKey(recoveryPlan.run_id, index);
              const decision = recoveryDecisions[decisionKey];
              return <li className={`fact recovery-task${decision === "dismissed" ? " recovery-task-dismissed" : ""}`} key={decisionKey}>
                <div className="recovery-task-heading"><h3>{task.title}</h3><span className={`tag ${task.priority === "high" ? "warn" : "unknown"}`}>{task.priority} priority</span></div>
                <p>{task.reason}</p>
                <p className="helper">Owner: {task.owner_role.replaceAll("_", " ")}{task.task_ids.length ? ` · Related tasks: ${task.task_ids.join(", ")}` : ""}</p>
                <p className="helper">Based on: {task.source_risk_indices.map(i => `risk ${i + 1}`).join(", ")}</p>
                <div className="recovery-review-actions" aria-label={`Review ${task.title}`}>
                  <button className="secondary-button recovery-choice keep" type="button" aria-pressed={decision === "kept"} onClick={() => decideRecoveryTask(decisionKey, "kept")}>Keep suggestion</button>
                  <button className="secondary-button recovery-choice dismiss" type="button" aria-pressed={decision === "dismissed"} onClick={() => decideRecoveryTask(decisionKey, "dismissed")}>Dismiss suggestion</button>
                  {decision && <span className={`tag ${decision === "kept" ? "good" : "unknown"}`} role="status">{decision === "kept" ? "Kept for this review" : "Dismissed for this review"}</span>}
                </div>
              </li>;
            })}</ul>
          </>)}
      </details>
    </main>
  );
}
