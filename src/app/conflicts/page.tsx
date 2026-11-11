"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useEventPlan } from "../../client/event-plan";
import { scheduleReviewResponseSchema, type ScheduleReviewResponse } from "../../lib/schedule-rules";
import { buildPlanningFindings } from "../../lib/planning-findings";

export default function ConflictsPage() {
  const { plan, vendors } = useEventPlan();
  const [agentReport, setAgentReport] = useState<ScheduleReviewResponse | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const planKey = JSON.stringify(plan);
  useEffect(() => { request.current?.abort(); request.current = null; setBusy(false); setAgentReport(null); setAgentError(null); return () => request.current?.abort(); }, [planKey]);

  const { selected, input, scheduleReady, findings } = buildPlanningFindings(plan, vendors);

  async function runAgents() {
    if (!scheduleReady) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setAgentError(null); setAgentReport(null);
    try {
      const response = await fetch("/api/schedule-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store", signal: controller.signal });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "The agent review could not finish.");
      const parsed = scheduleReviewResponseSchema.safeParse(payload);
      if (!parsed.success) throw new Error("The agent review returned an invalid report.");
      if (!controller.signal.aborted) setAgentReport(parsed.data);
    } catch (error) {
      if (!controller.signal.aborted) setAgentError(error instanceof Error ? error.message : "The agent review could not finish.");
    } finally { if (!controller.signal.aborted) { setBusy(false); request.current = null; } }
  }

  return <main className="page-shell workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">Nothing escapes the radar</p><h1>Potential conflicts</h1><p>Timing rules and access gaps are checked here. Different vendors may work at the same time, including florists and decorators.</p></div><Link className="primary-button" href="/arrival">Next: arrival and setup →</Link></header>
    <section className="conflict-summary"><div><strong>{findings.filter(item => item.tone === "needs-action").length}</strong><span>Needs attention</span></div><div><strong>{findings.filter(item => item.tone === "check").length}</strong><span>Worth checking</span></div><div><strong>{selected.length}</strong><span>Vendors selected</span></div></section>
    <section className="panel"><div className="panel-header"><div><h2>Schedule findings</h2><p className="helper">Based on the dates and times in your plan.</p></div></div>{findings.length ? <ul className="finding-list">{findings.map(item => <li key={item.id} className={`finding-card ${item.tone}`}><span className="finding-symbol" aria-hidden="true">{item.tone === "needs-action" ? "!" : "?"}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></li>)}</ul> : <div className="no-findings"><span aria-hidden="true">✦</span><h3>Clear skies so far</h3><p>No issue appears under the recorded timing rules. Confirm real vendor availability and venue access separately.</p></div>}
      <div className="conflict-actions">{findings.length > 0 && <button className="primary-button" type="button" disabled={!scheduleReady || busy} onClick={runAgents}>{busy ? "Checking…" : "Review with AI"}</button>}<Link href="/vendors">Change vendor times →</Link></div>
      {findings.length > 0 && !scheduleReady && <p className="helper">Add a valid event time and at least one vendor to request AI suggestions.</p>}
      {agentError && <p className="alert" role="alert">{agentError}</p>}
      {agentReport && <div className="agent-results" role="status"><h3>{agentReport.issues.length ? "Suggested next steps" : "No vendor timing-rule concerns"}</h3>{agentReport.issues.map(issue => <div key={issue.id}><strong>{issue.vendorName}</strong><p>{agentReport.suggestions.find(item => item.issue_id === issue.id)?.text ?? issue.message}</p></div>)}</div>}
      <p className="helper">AI suggestions do not change your plan or contact vendors.</p>
    </section>
  </main>;
}
