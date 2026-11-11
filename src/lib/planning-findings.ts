import type { EventPlan } from "../client/event-plan";
import type { Service } from "../client/event-plan";
import type { Vendor } from "./vendor-search";
import { serviceLabels } from "./services";
import { evaluateSchedule, type ScheduleIssue } from "./schedule-rules";
import { findScheduleOverlaps, overlapsForOtherEvent, validSchedule } from "./schedule-conflicts";

export type PlanningFinding = { id: string; title: string; detail: string; tone: "needs-action" | "check" };

const fallbackNames: Record<Exclude<Service, "venue">, string> = { catering: "Caterer", florist: "Florist", entertainment: "DJ / entertainment", bakery: "Bakery", av: "AV", photography: "Photographer", decorator: "Decorator" };

/**
 * Selected non-venue vendors with their recorded times. The category comes from the plan itself, so a vendor
 * missing from the loaded directory (still loading, offline, removed, or opened from another deployment) is
 * still checked under a placeholder name instead of being silently dropped.
 */
export function selectedVendorSchedules(plan: Pick<EventPlan, "selections" | "vendorSlots">, vendors: Vendor[]) {
  return (Object.entries(plan.selections) as [Service, string | undefined][]).flatMap(([service, id]) => {
    if (service === "venue" || !id) return [];
    const vendor = vendors.find(item => item.id === id);
    const name = vendor ? vendor.name.slice(0, 200) : `Selected ${fallbackNames[service].toLowerCase()} (details not loaded)`;
    return [{ id, name, category: service, slot: plan.vendorSlots[id] ?? null, missing: !vendor }];
  });
}

/** Include missing directory entries so a coordinator can still change or remove a saved choice. */
export function selectedPlanRows(plan: Pick<EventPlan, "selections" | "vendorSlots">, vendors: Vendor[]) {
  const venueId = plan.selections.venue;
  const venue = venueId ? vendors.find(item => item.id === venueId) : undefined;
  const venueRows = venueId ? [{ service: "venue" as Service, id: venueId, name: venue?.name ?? "Selected venue (details not loaded)", vendor: venue }] : [];
  const vendorRows = selectedVendorSchedules(plan, vendors).map(item => ({
    service: item.category as Service, id: item.id, name: item.name,
    vendor: vendors.find(vendor => vendor.id === item.id),
  }));
  return [...venueRows, ...vendorRows];
}

export function vendorResultAction(vendor: Pick<Vendor, "id" | "name" | "service">, selections: EventPlan["selections"]) {
  const service = vendor.service as Service;
  if (selections[service] === vendor.id) return { label: "Already in your plan", disabled: true };
  if (selections[service]) return { label: `Replace planned ${serviceLabels[service].toLowerCase()} with ${vendor.name}`, disabled: false };
  return { label: `Add ${vendor.name} to plan`, disabled: false };
}

/** All events and scheduled vendor work use one event room. Concurrent vendors are allowed. */
export function buildPlanningFindings(plan: EventPlan, vendors: Vendor[]) {
  const chosen = selectedVendorSchedules(plan, vendors);
  const missingCount = chosen.filter(item => item.missing).length;
  const selected = chosen.map(({ missing: _missing, ...vendor }) => vendor);
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
  if (!scheduleReady) for (const vendor of selected) {
    if (!vendor.slot || !validSchedule(vendor.slot)) findings.push({ id: `missing-slot:${vendor.id}`, title: `Set ${vendor.name}'s time`, detail: "Choose a valid date, arrival time, and finish time for this vendor.", tone: "needs-action" });
  }
  if (missingCount) findings.unshift({ id: "vendors-not-loaded", title: "Some vendor details didn't load", detail: `${missingCount === 1 ? "1 selected vendor is" : `${missingCount} selected vendors are`} not in the vendor list that loaded. Timing rules still use the recorded times. Reload the page, or choose the vendor again, before relying on names and details.`, tone: "check" });
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
    if (overlaps.length) findings.push({ id: "event-overlap", title: "Events overlap in the room", detail: `${overlaps.map(item => item.name).join(", ")} overlaps this event in the one event room. Change an event time or remove the overlapping event.`, tone: "needs-action" });
  }
  const vendorEvents = selected.filter((item): item is typeof item & { slot: NonNullable<typeof item.slot> } => !!item.slot && validSchedule(item.slot));
  for (const event of plan.otherEvents) {
    const overlaps = overlapsForOtherEvent(event, plan.otherEvents, vendorEvents);
    const overlappingVendors = overlaps.filter(item => vendorEvents.some(vendor => vendor.id === item.id));
    if (overlappingVendors.length) findings.push({ id: `other-event-vendors:${event.id}`, title: `${event.name} conflicts with vendor setup`, detail: `${overlappingVendors.map(item => item.name).join(", ")} is scheduled in the event room during this event. Change a time or remove the overlapping event.`, tone: "needs-action" });
    const overlappingEvents = overlaps.filter(item => plan.otherEvents.some(other => other.id === item.id) && event.id < item.id);
    if (overlappingEvents.length) findings.push({ id: `other-event-overlap:${event.id}`, title: "Events overlap in the room", detail: `${event.name} overlaps ${overlappingEvents.map(item => item.name).join(", ")} in the one event room. Change an event time or remove one of them.`, tone: "needs-action" });
  }
  return { selected, input, ruleIssues, scheduleReady, findings };
}
