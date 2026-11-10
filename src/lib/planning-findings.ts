import type { EventPlan } from "../client/event-plan";
import type { Service } from "../client/event-plan";
import type { Vendor } from "./vendor-search";
import { evaluateSchedule, type ScheduleIssue } from "./schedule-rules";
import { findScheduleOverlaps, overlapsForOtherEvent, validSchedule } from "./schedule-conflicts";

export type PlanningFinding = { id: string; title: string; detail: string; tone: "needs-action" | "check" };

/** Deterministic warnings only. A shared time alone never proves a booking conflict. */
export function buildPlanningFindings(plan: EventPlan, vendors: Vendor[]) {
  const selected = (Object.entries(plan.selections) as [Service, string | undefined][]).filter(([service, id]) => service !== "venue" && !!id).flatMap(([service, id]) => {
    const vendor = vendors.find(item => item.id === id);
    return vendor ? [{ id: vendor.id, name: vendor.name.slice(0, 200), category: service, slot: plan.vendorSlots[vendor.id] ?? null }] : [];
  });
  const input = { version: "schedule-review.v1", event: { date: plan.eventDate, start: plan.eventStart, end: plan.eventEnd }, vendors: selected };
  let ruleIssues: ScheduleIssue[] = [];
  let scheduleReady = false;
  let scheduleError = false;
  if (selected.length > 0) {
    try { ruleIssues = evaluateSchedule(input).issues; scheduleReady = true; }
    catch { scheduleError = true; }
  }
  const findings: PlanningFinding[] = ruleIssues.map(issue => ({ id: issue.id, title: issue.vendorName, detail: issue.message, tone: "needs-action" }));
  const mainSlot = { date: plan.eventDate, start: plan.eventStart, end: plan.eventEnd };
  if (!validSchedule(mainSlot) || scheduleError) findings.unshift({ id: "event-time", title: "Check event and vendor times", detail: "Choose real dates and same-day start and end times in New York time. Times during a daylight-saving change may need another choice.", tone: "needs-action" });
  if (!plan.selections.venue) findings.push({ id: "venue", title: "Choose a venue", detail: "Your event needs a venue before access hours can be checked.", tone: "needs-action" });
  const venueSlot = plan.selections.venue ? plan.vendorSlots[plan.selections.venue] : undefined;
  if (plan.selections.venue && !venueSlot) findings.push({ id: "venue-hours", title: "Add venue access hours", detail: "Set a date and time for the selected venue so setup access can be reviewed.", tone: "check" });
  else if (venueSlot && !validSchedule(venueSlot)) findings.push({ id: "venue-hours", title: "Check venue access hours", detail: "Choose a real date and valid start and end times for venue access.", tone: "needs-action" });
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
  const vendorEvents = selected.filter((item): item is typeof item & { slot: NonNullable<typeof item.slot> } => !!item.slot && validSchedule(item.slot));
  for (const event of plan.otherEvents) {
    const overlappingVendors = overlapsForOtherEvent(event, plan.otherEvents, vendorEvents).filter(item => vendorEvents.some(vendor => vendor.id === item.id));
    if (overlappingVendors.length) findings.push({ id: `other-event-vendors:${event.id}`, title: `Check ${event.name} against planned vendors`, detail: `${overlappingVendors.map(item => item.name).join(", ")} shares a time with this event. Confirm whether they need the same space or staff.`, tone: "check" });
  }
  return { selected, input, ruleIssues, scheduleReady, findings };
}
