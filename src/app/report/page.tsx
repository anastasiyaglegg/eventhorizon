"use client";

import Link from "next/link";
import { serviceLabels, useEventPlan, type Service } from "../../client/event-plan";
import { budgetSummary, buildBudgetFindings, money } from "../../lib/budget";
import { themeName } from "../../lib/event-themes";
import { validSchedule } from "../../lib/schedule-conflicts";

export default function ReportPage() {
  const { plan, vendors, directorySource } = useEventPlan();
  const budget = budgetSummary(plan);
  const budgetFindings = buildBudgetFindings(plan, vendors);
  const selected = (Object.entries(plan.selections) as [Service, string | undefined][]).flatMap(([service, id]) => {
    if (!id) return [];
    const vendor = vendors.find(item => item.id === id);
    return [{ service, id, name: vendor?.name ?? "Vendor details unavailable", borough: vendor?.borough ?? "Unknown", slot: plan.vendorSlots[id], status: plan.vendorStatuses[id] ?? "considering", plannedBudget: plan.categoryBudgets?.[service] || null, startingPrice: vendor?.priceMin ?? null }];
  });
  return <main className="page-shell workspace-page report-page">
    <header className="workspace-heading"><div><p className="eyebrow">Your event, all in one place</p><h1>Planning report</h1><p>A snapshot of your event, chosen vendors, and budget. No vendor has been booked or messaged by this report.</p></div><button className="secondary-button print-button" type="button" onClick={() => window.print()}>Print or save as PDF</button></header>
    <section className="panel"><h2>{plan.name || "Untitled event"}</h2><p>Theme: {themeName(plan.themeId) ?? "Not chosen"}</p><p>{plan.eventDate || "Date not set"} · {plan.eventStart || "Start not set"}–{plan.eventEnd || "End not set"} · {plan.eventGuests || "Unknown"} guests</p><p className="helper">Times are planned in New York time. {directorySource === "sample" ? "The vendor directory and its prices, ratings, and reviews are fictional demo data." : "Vendor directory details may be incomplete; confirm them with each business."}</p></section>
    <section className="panel"><h2>Budget</h2><div className="report-metrics"><div><span>Total event budget</span><strong>{budget.limitCents === null ? "Not set" : money(budget.limitCents)}</strong></div><div><span>Planned spend</span><strong>{money(budget.plannedCents)}</strong></div><div><span>{budget.remainingCents !== null && budget.remainingCents < 0 ? "Over budget" : "Remaining"}</span><strong>{budget.remainingCents === null ? "Not set" : money(Math.abs(budget.remainingCents))}</strong></div><div><span>Vendors without a budget</span><strong>{budget.unbudgetedCount}</strong></div></div><p className="helper">Each category budget is the amount you plan to spend. Listed starting prices are references, not confirmed quotes.</p>{budgetFindings.length > 0 && <ul className="finding-list">{budgetFindings.map(item => <li key={item.id} className={`finding-card ${item.tone}`}><div><strong>{item.title}</strong><p>{item.detail}</p></div></li>)}</ul>}</section>
    <section className="panel"><h2>Venue and vendors</h2>{selected.length ? <ul className="report-vendors">{selected.map(item => <li key={`${item.service}:${item.id}`}><div><strong>{serviceLabels[item.service]} · {item.name}</strong><p>{item.borough} · {item.slot && validSchedule(item.slot) ? `${item.slot.date} ${item.slot.start}–${item.slot.end}` : "Time not set"}</p></div><div><p>Planned budget: {item.plannedBudget ? money(Math.round(Number(item.plannedBudget) * 100)) : "Not set"}</p><p>{item.startingPrice !== null ? `Listed starting price: ${money(Math.round(item.startingPrice * 100))} (confirm with vendor)` : "Listed price: Unknown"}</p><p>Status: {item.status === "confirmed" ? "Confirmed by vendor" : item.status === "contacted" ? "Contacted" : "Considering"}</p></div></li>)}</ul> : <p className="empty-state">No venue or vendors selected yet.</p>}</section>
    <Link href="/arrival">← Review arrival and setup</Link>
  </main>;
}
