"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useEventPlan, serviceLabels, type Service } from "../../client/event-plan";
import { evaluateSchedule, scheduleReviewResponseSchema, type ScheduleIssue, type ScheduleReviewResponse } from "../../lib/schedule-rules";
import { findScheduleOverlaps, validSchedule } from "../../lib/schedule-conflicts";

type Finding = { id: string; title: string; detail: string; tone: "needs-action" | "check" };

export default function ConflictsPage() {
  const { plan, vendors } = useEventPlan();
  const [agentReport, setAgentReport] = useState<ScheduleReviewResponse | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const planKey = JSON.stringify(plan);
  useEffect(() => { request.current?.abort(); request.current = null; setBusy(false); setAgentReport(null); setAgentError(null); return () => request.current?.abort(); }, [planKey]);

  const selected = useMemo(() => (Object.entries(plan.selections) as [Service, string | undefined][]).filter(([service, id]) => service !== "venue" && !!id).flatMap(([service, id]) => {
    const vendor = vendors.find(item => item.id === id);
    return vendor ? [{ id: vendor.id, name: vendor.name.slice(0, 200), category: service, slot: plan.vendorSlots[vendor.id] ?? null }] : [];
  }), [plan.selections, plan.vendorSlots, vendors]);
  const input = { version: "schedule-review.v1", event: { date: plan.eventDate, start: plan.eventStart, end: plan.eventEnd }, vendors: selected };
  let ruleIssues: ScheduleIssue[] = [];
  let scheduleReady = false;
  if (selected.length > 0) {
    try { ruleIssues = evaluateSchedule(input).issues; scheduleReady = true; } catch { /* Incomplete dates stay a visible finding below. */ }
  }
  const findings: Finding[] = ruleIssues.map(issue => ({ id: issue.id, title: issue.vendorName, detail: issue.message, tone: "needs-action" }));
  const mainSlot = { date: plan.eventDate, start: plan.eventStart, end: plan.eventEnd };
  if (!validSchedule(mainSlot)) findings.unshift({ id: "event-time", title: "Finish the event time", detail: "Choose a date and valid same-day start and end times on the calendar or vendor page.", tone: "needs-action" });
  if (!plan.selections.venue) findings.push({ id: "venue", title: "Choose a venue", detail: "Your event needs a venue before access hours can be checked.", tone: "needs-action" });
  const venueSlot = plan.selections.venue ? plan.vendorSlots[plan.selections.venue] : undefined;
  if (plan.selections.venue && !venueSlot) findings.push({ id: "venue-hours", title: "Add venue access hours", detail: "Set a date and time for the selected venue so setup access can be reviewed.", tone: "check" });
  for (const vendor of selected) {
    if (!vendor.slot || !validSchedule(vendor.slot) || !venueSlot || !validSchedule(venueSlot)) continue;
    if (vendor.slot.date !== venueSlot.date) {
      findings.push({ id: `venue-date:${vendor.id}`, title: `Confirm venue access for ${vendor.name}`, detail: "This setup is on another date. Venue access for that date has not been recorded.", tone: "check" });
    } else if (vendor.slot.start < venueSlot.start || vendor.slot.end > venueSlot.end) {
      findings.push({ id: `venue-access:${vendor.id}`, title: `Check access hours for ${vendor.name}`, detail: "This vendor is scheduled outside the recorded venue access hours.", tone: "needs-action" });
    }
  }
  if (validSchedule(mainSlot)) {
    const overlaps = findScheduleOverlaps({ id: "main-event", name: plan.name, slot: mainSlot }, plan.otherEvents);
    if (overlaps.length) findings.push({ id: "event-overlap", title: "Two events share a time", detail: `${overlaps.map(item => item.name).join(", ")} overlaps this event. Check whether they share a room or staff; overlap alone is not a conflict.`, tone: "check" });
  }

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
    <div className="conflict-layout"><section className="panel"><div className="panel-header"><div><h2>Schedule findings</h2><p className="helper">Based on the dates and times in your local plan.</p></div><span className="tag good">Concurrent setup allowed</span></div>{findings.length ? <ul className="finding-list">{findings.map(item => <li key={item.id} className={`finding-card ${item.tone}`}><span className="finding-symbol" aria-hidden="true">{item.tone === "needs-action" ? "!" : "?"}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></li>)}</ul> : <div className="no-findings"><span aria-hidden="true">✦</span><h3>Clear skies so far</h3><p>No issue appears under the recorded timing rules. Confirm real vendor availability and venue access separately.</p></div>}</section>
      <aside className="panel"><p className="eyebrow">The agent handoff</p><h2>Ask Planning and Recovery</h2><p>Planning checks the rule findings. Recovery suggests a next step for each one. Their suggestions do not change your plan or contact a vendor.</p><button className="primary-button" type="button" disabled={!scheduleReady || busy} onClick={runAgents}>{busy ? "Agents checking…" : "Run agent review"}</button>{!scheduleReady && <p className="helper">Add a valid main event time and at least one vendor first.</p>}{agentError && <p className="alert" role="alert">{agentError}</p>}{agentReport && <div className="agent-results" role="status"><h3>{agentReport.issues.length ? "Suggested next steps" : "No rule issues"}</h3>{agentReport.issues.map(issue => <div key={issue.id}><strong>{issue.vendorName}</strong><p>{agentReport.suggestions.find(item => item.issue_id === issue.id)?.text ?? issue.message}</p></div>)}</div>}<p className="helper">Vendor times may overlap. This is expected for concurrent setup, not proof of a conflict.</p><Link href="/vendors">Change vendor times →</Link></aside>
    </div>
    <section className="panel"><h2>Your timing rules</h2><div className="rules-grid"><p><strong>🍴 Catering &amp; bakery</strong><br />Start 1–3 hours before. Finish 1–3 hours after.</p><p><strong>🌸 Florist &amp; decorator</strong><br />May set up together up to 2 days before.</p><p><strong>✦ Other vendors</strong><br />May work at the same time. Start at least 1 hour before.</p></div><p className="helper">A booked status or email confirmation is not created by these local planning choices.</p></section>
  </main>;
}
