"use client";

import Link from "next/link";
import { serviceLabels, useEventPlan, type Service } from "../../client/event-plan";
import { buildPlanningFindings } from "../../lib/planning-findings";
import { validSchedule } from "../../lib/schedule-conflicts";

export default function ArrivalPage() {
  const { plan, vendors } = useEventPlan();
  const { findings } = buildPlanningFindings(plan, vendors);
  const selected = (Object.entries(plan.selections) as [Service, string | undefined][]).flatMap(([service, id]) => {
    if (!id) return [];
    const vendor = vendors.find(item => item.id === id);
    return [{ service, id, name: vendor?.name ?? `Selected ${serviceLabels[service].toLowerCase()} (details unavailable)`, slot: plan.vendorSlots[id] }];
  });
  const ordered = selected.sort((a, b) => (a.slot?.date ?? "9999").localeCompare(b.slot?.date ?? "9999") || (a.slot?.start ?? "99:99").localeCompare(b.slot?.start ?? "99:99"));
  const needsAttention = findings.filter(item => item.tone === "needs-action");
  return <main className="page-shell workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">One last timing pass</p><h1>Arrival and setup</h1><p>Review the times you entered for {plan.name || "your event"}. These are planned times, not vendor confirmations.</p></div></header>
    <section className="panel"><h2>Your event</h2><p>{plan.eventDate || "Date not set"} · {plan.eventStart || "Start not set"}–{plan.eventEnd || "End not set"} · {plan.eventGuests || "Guest count unknown"} guests</p><p className="helper">All times use the event’s New York time zone.</p></section>
    <section className="panel"><h2>Venue and vendor times</h2>{ordered.length ? <ol className="arrival-list">{ordered.map(item => <li key={`${item.service}:${item.id}`}><div><strong>{serviceLabels[item.service]} · {item.name}</strong><p>{item.slot && validSchedule(item.slot) ? `${item.slot.date} · ${item.slot.start}–${item.slot.end}` : "Date or time still needed"}</p></div><span className={`tag ${plan.vendorStatuses[item.id] === "confirmed" ? "good" : "warn"}`}>{plan.vendorStatuses[item.id] === "confirmed" ? "Confirmed by vendor" : plan.vendorStatuses[item.id] === "contacted" ? "Contacted" : "Considering"}</span></li>)}</ol> : <p className="empty-state">Choose a venue and vendors first.</p>}<Link href="/vendors">Change planned times or vendors →</Link></section>
    <section className="panel"><h2>Timing check</h2>{findings.length ? <ul className="finding-list">{findings.map(item => <li key={item.id} className={`finding-card ${item.tone}`}><div><strong>{item.title}</strong><p>{item.detail}</p></div></li>)}</ul> : <p className="success">No issue appears under the recorded timing rules. Confirm vendor availability and venue access directly.</p>}<p className="helper">{needsAttention.length} item{needsAttention.length === 1 ? "" : "s"} need attention. Review timing details on the Potential conflicts page before contacting vendors.</p><p className="helper">To try the separate proposed-arrival example, <Link href="/review">open arrival review →</Link>. It does not change this event plan.</p></section>
    <div className="journey-next"><Link className="primary-button" href="/report">Next: final report →</Link></div>
  </main>;
}
