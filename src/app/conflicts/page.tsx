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
    <header className="workspace-heading"><div><p className="eyebrow">Nothing escapes the radar</p><h1>Potential conflicts</h1><p>Timing rules and access gaps are checked here. Different vendors may work at the same time, including florists and decorators.</p></div><Link className="primary-button" href="/calendar">View calendar →</Link></header>
    <section className="conflict-summary"><div><strong>{findings.filter(item => item.tone === "needs-action").length}</strong><span>Needs attention</span></div><div><strong>{findings.filter(item => item.tone === "check").length}</strong><span>Worth checking</span></div><div><strong>{selected.length}</strong><span>Vendors selected</span></div></section>
    <div className="conflict-layout"><section className="panel"><div className="panel-header"><div><h2>Schedule findings</h2><p className="helper">Based on the dates and times in your plan.</p></div><span className="tag good">Vendors may work together</span></div>{findings.length ? <ul className="finding-list">{findings.map(item => <li key={item.id} className={`finding-card ${item.tone}`}><span className="finding-symbol" aria-hidden="true">{item.tone === "needs-action" ? "!" : "?"}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></li>)}</ul> : <div className="no-findings"><span aria-hidden="true">✦</span><h3>Clear skies so far</h3><p>No issue appears under the recorded timing rules. Confirm real vendor availability and venue access separately.</p></div>}</section>
      <aside className="panel"><p className="eyebrow">An extra set of eyes</p><h2>Get suggested next steps</h2><p>AI can suggest next steps for vendor timing rules. Room conflicts are listed separately above. AI will not change your plan or contact a vendor.</p><button className="primary-button" type="button" disabled={!scheduleReady || busy} onClick={runAgents}>{busy ? "Checking…" : "Review with AI"}</button>{!scheduleReady && <p className="helper">Add a valid main event time and at least one vendor first.</p>}{agentError && <p className="alert" role="alert">{agentError}</p>}{agentReport && <div className="agent-results" role="status"><h3>{agentReport.issues.length ? "Suggested next steps" : "No vendor timing-rule concerns"}</h3>{agentReport.issues.map(issue => <div key={issue.id}><strong>{issue.vendorName}</strong><p>{agentReport.suggestions.find(item => item.issue_id === issue.id)?.text ?? issue.message}</p></div>)}</div>}<p className="helper">Vendors may work together in the one event room. Separate events cannot occupy that room at the same time.</p><Link href="/vendors">Change vendor times →</Link></aside>
    </div>
    <section className="panel"><h2>Your timing rules</h2><div className="rules-grid"><p><strong>🍴 Catering &amp; bakery</strong><br />Start 1–3 hours before. Finish 1–3 hours after.</p><p><strong>🌸 Florist &amp; decorator</strong><br />May set up together up to 2 days before.</p><p><strong>✦ Other vendors</strong><br />May work at the same time. Start at least 1 hour before.</p></div><p className="helper">Adding a vendor to your plan does not reserve them or send an email.</p></section>
  </main>;
}
