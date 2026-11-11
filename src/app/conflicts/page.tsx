"use client";

import Link from "next/link";
import { useEventPlan } from "../../client/event-plan";
import { buildPlanningFindings } from "../../lib/planning-findings";

export default function ConflictsPage() {
  const { plan, vendors } = useEventPlan();
  const { selected, findings } = buildPlanningFindings(plan, vendors);

  return <main className="page-shell workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">Nothing escapes the radar</p><h1>Potential conflicts</h1><p>Timing rules and access gaps are checked here. Different vendors may work at the same time, including florists and decorators.</p></div><Link className="primary-button" href="/arrival">Next: arrival and setup →</Link></header>
    <section className="conflict-summary"><div><strong>{findings.filter(item => item.tone === "needs-action").length}</strong><span>Needs attention</span></div><div><strong>{findings.filter(item => item.tone === "check").length}</strong><span>Worth checking</span></div><div><strong>{selected.length}</strong><span>Vendors selected</span></div></section>
    <section className="panel"><div className="panel-header"><div><h2>Schedule findings</h2><p className="helper">Based on the dates and times in your plan.</p></div></div>{findings.length ? <ul className="finding-list">{findings.map(item => <li key={item.id} className={`finding-card ${item.tone}`}><span className="finding-symbol" aria-hidden="true">{item.tone === "needs-action" ? "!" : "?"}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></li>)}</ul> : <div className="no-findings"><span aria-hidden="true">✦</span><h3>Clear skies so far</h3><p>No issue appears under the recorded timing rules. Confirm real vendor availability and venue access separately.</p></div>}
      <div className="conflict-actions"><Link href="/vendors">Change vendor times →</Link></div>
    </section>
  </main>;
}
