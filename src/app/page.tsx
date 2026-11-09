"use client";

import { useEffect, useMemo, useState } from "react";
import { analysisInputSchema } from "../lib/contract";
import { requestAnalysis } from "../client/analysis-api";
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

  function updateArrival(value: string) {
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

    const requestId = crypto.randomUUID();
    const pending = beginAnalysis(clearProposal(session), proposedArrival, requestId);
    setSession(pending);
    setBusy(true);
    setInputError(null);

    try {
      const input = buildAnalysisInput(pending.event, proposedArrival);
      const packet = await requestAnalysis(input);
      setSession((current) =>
        current ? receiveAnalysis(current, requestId, packet) : current,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analysis could not finish. Please retry.";
      setSession((current) =>
        current ? failAnalysis(current, requestId, message) : current,
      );
    } finally {
      setBusy(false);
    }
  }

  function makeDecision(decision: "approve" | "reject") {
    if (!session) return;
    try {
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
          <h1>Planning / Readiness review</h1>
          <p className="subtitle">
            Explore one proposed vendor arrival against the seeded event. The server makes one
            combined AI analysis call; exact timing stays calculated in application code.
          </p>
        </div>
        <span className="status-pill">Core P0 · Planning/readiness</span>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{event.name}</h2>
            <p className="helper">Seeded event · {event.event_date} · {event.time_zone}</p>
          </div>
          <span className="tag good">Local session only</span>
        </div>
        <div className="event-meta">
          <div className="fact"><span className="fact-label">Current vendor arrival</span><span className="fact-value">{formatClock(currentArrival)}</span></div>
          <div className="fact"><span className="fact-label">Setup duration</span><span className="fact-value">{event.vendor.setup_duration_minutes === null ? "Unknown" : `${event.vendor.setup_duration_minutes} minutes`}</span></div>
          <div className="fact"><span className="fact-label">Event starts</span><span className="fact-value">{formatClock(event.start_time)}</span></div>
        </div>
        <h3 style={{ marginTop: 24 }}>Vendor-dependent tasks</h3>
        <ul className="task-list">
          {dependent.map((task) => (
            <li className="task-item" key={task.task_id}>
              <span><span className="task-name">{task.name}</span><span className="task-detail"> · {task.task_id}</span></span>
              <span className="task-detail">{formatClock(task.start_time)}–{formatClock(task.end_time)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Propose a vendor arrival</h2>
        <p className="helper" id="arrival-help">Enter 24-hour time in HH:MM format, such as 17:00, using the event’s local time zone. Leave blank if the arrival is unknown.</p>
        <div className="arrival-form">
          <div className="field">
            <label htmlFor="proposed-arrival">Proposed arrival</label>
            <input
              id="proposed-arrival"
              type="text"
              autoComplete="off"
              placeholder="17:00"
              maxLength={5}
              aria-describedby="arrival-help"
              value={arrivalInput}
              onChange={(eventChange) => updateArrival(eventChange.target.value)}
            />
          </div>
          <button className="secondary-button" type="button" onClick={() => updateArrival("")} disabled={arrivalInput === ""}>
            Clear arrival
          </button>
          <button className="primary-button" type="button" onClick={analyzeProposal} disabled={busy}>
            {busy ? "Analyzing…" : "Analyze impact"}
          </button>
        </div>
        {inputError && <div className="alert" role="alert">{inputError}</div>}
        <div className="comparison">
          <div className="comparison-card"><span className="fact-label">Current event</span><span className="fact-value">{formatClock(currentArrival)}</span></div>
          <div className="comparison-card proposed"><span className="fact-label">Proposed scenario</span><span className="fact-value">{arrivalInput ? formatClock(`${arrivalInput}:00`) : "Unknown"}</span></div>
        </div>
      </section>

      {session.status === "error" && <div className="alert" role="alert">{session.error || "The analysis is unavailable. Please retry."}</div>}
      {session.status === "approved" && <div className="success" role="status">Approved locally. The session event now uses {formatClock(event.vendor.arrival_time)}.</div>}
      {session.status === "rejected" && <div className="success" role="status">Rejected locally. The session event still uses {formatClock(event.vendor.arrival_time)}.</div>}

      <div className="review-grid">
        <section className="panel result-card">
          <h2>Exact timing <span className={`tag ${overlapTag}`}>{calculation ? overlapLabel : "Awaiting analysis"}</span></h2>
          {calculation ? (
            <>
              <div className="metric-grid">
                <div className="metric"><span className="metric-label">Setup completes</span><span className="metric-value">{formatClock(calculation.setup_finish)}</span></div>
                <div className="metric"><span className="metric-label">Event starts</span><span className="metric-value">{formatClock(event.start_time)}</span></div>
                <div className="metric"><span className="metric-label">Event-start overlap</span><span className="metric-value">{formatMinutes(calculation.overlap_minutes)}</span></div>
              </div>
              <h3 style={{ marginTop: 24 }}>Calculated affected task IDs</h3>
              {calculation.affected_task_ids.length > 0 ? (
                <ul className="task-list">{calculation.affected_task_ids.map((taskId) => <li className="task-item" key={taskId}><span className="task-name">{taskId}</span><span className="task-detail">dependent on vendor readiness</span></li>)}</ul>
              ) : <div className="empty-state">No dependent task is calculated as affected.</div>}
              {calculation.unknowns.length > 0 && <><h3 style={{ marginTop: 24 }}>Calculated unknowns</h3><ul className="unknown-list">{calculation.unknowns.map((unknown) => <li className="empty-state" key={unknown}>{unknown}</li>)}</ul></>}
            </>
          ) : <div className="empty-state">Run an analysis to see setup completion and the exact code-calculated overlap.</div>}
          <p className="footnote">These values come from deterministic server-side time calculations, not from the AI response.</p>
        </section>

        <section className="panel result-card">
          <h2>Planning / Readiness findings <span className="tag good">AI interpretation</span></h2>
          {analysis ? (
            <>
              <p className="helper">Validated response · {analysis.contract_version}</p>
              <h3 style={{ marginTop: 22 }}>Affected task IDs</h3>
              {analysis.affected_task_ids.length > 0 ? <ul className="task-list">{analysis.affected_task_ids.map((taskId) => <li className="task-item" key={taskId}><span className="task-name">{taskId}</span></li>)}</ul> : <div className="empty-state">The AI identified no affected task IDs.</div>}
              <h3 style={{ marginTop: 22 }}>Scheduling risks</h3>
              {analysis.scheduling_risks.length > 0 ? <ul className="risk-list">{analysis.scheduling_risks.map((risk, index) => <li className="risk-item" key={`${risk.type}-${index}`}><div className="risk-type">{risk.type}</div><p>{risk.description}</p><strong>Evidence references</strong><ul className="evidence-list">{risk.evidence.map((evidence, evidenceIndex) => <li className="evidence-item" key={`${evidence.source}-${evidence.field}-${evidenceIndex}`}>{evidence.source}{evidence.id ? `:${evidence.id}` : ""}.{evidence.field}</li>)}</ul></li>)}</ul> : <div className="empty-state">No scheduling risk was identified.</div>}
              <h3 style={{ marginTop: 22 }}>Unknowns</h3>
              {analysis.unknowns.length > 0 ? <ul className="unknown-list">{analysis.unknowns.map((unknown) => <li className="empty-state" key={unknown}>{unknown}</li>)}</ul> : <div className="empty-state">No unknown information was reported.</div>}
              <h3 style={{ marginTop: 22 }}>Recommendation</h3>
              <p>{analysis.recommendation.action}</p>
            </>
          ) : <div className="empty-state">Run an analysis to see the validated combined Planning/Readiness report.</div>}
          <p className="footnote">AI findings are interpretation only. They cannot change event data or approve a proposal.</p>
        </section>
      </div>

      <section className="panel">
        <h2>Review proposed change</h2>
        <p className="helper">Approval is a local session action. It does not call an external approval backend.</p>
        <div className="comparison">
          <div className="comparison-card"><span className="fact-label">Current arrival</span><span className="fact-value">{formatClock(currentArrival)}</span></div>
          <div className="comparison-card proposed"><span className="fact-label">Proposed arrival</span><span className="fact-value">{pendingArrival ? formatClock(pendingArrival) : "Unknown"}</span></div>
        </div>
        <div className="decision-row">
          <button className="decision-button approve" type="button" onClick={() => makeDecision("approve")} disabled={!canApprove || busy}>Approve locally</button>
          <button className="decision-button reject" type="button" onClick={() => makeDecision("reject")} disabled={!canReview || busy}>Reject locally</button>
        </div>
        <p className="footnote">Approve is disabled until a valid analysis exists and a proposed arrival is present. Reject preserves the current session event.</p>
      </section>
    </main>
  );
}
