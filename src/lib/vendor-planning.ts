import { analysisInputSchema, type AnalysisInput } from "./contract";

export type PlannedSlot = { date: string; start: string; end: string };
type Party = { id: string; name: string; slot?: PlannedSlot };
const isTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const mins = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

/** Adapt a single coordinator-entered plan to the existing Planning contract.
 * Venue slot is access hours, not event start; setup duration is explicitly entered. */
export function vendorPlanToAnalysis(venue: Party, vendor: Party, eventStart: string, setupMinutes: number): AnalysisInput {
  const v = venue.slot, s = vendor.slot;
  if (!v || !s || !v.date || !s.date || ![v.start, v.end, s.start, s.end, eventStart].every(isTime) || v.start >= v.end || s.start >= s.end) throw new Error("Enter complete, valid dates and 24-hour time slots for the venue and vendor.");
  if (v.date !== s.date) throw new Error("This first check supports a vendor and venue on the same date.");
  if (eventStart < v.start || eventStart >= v.end) throw new Error("The event start must fall inside the venue access time.");
  if (s.start < v.start || s.end > v.end) throw new Error("The vendor slot is outside the venue access time. Adjust the plan before AI analysis.");
  if (!Number.isInteger(setupMinutes) || setupMinutes < 0 || setupMinutes > mins(s.end) - mins(s.start)) throw new Error("Enter a setup duration that fits within the vendor's time slot.");
  return analysisInputSchema.parse({ contract_version: "planning.v1", snapshot: { event: {
    name: venue.name, event_date: v.date, time_zone: "America/New_York", start_time: eventStart + ":00",
    vendor: { vendor_id: vendor.id, name: vendor.name, arrival_time: null, setup_duration_minutes: setupMinutes },
    tasks: [{ task_id: "vendor-ready", name: "Vendor setup complete before event starts", start_time: eventStart + ":00", end_time: null, depends_on_vendor_ids: [vendor.id] }],
  }, proposed_change: { vendor_id: vendor.id, proposed_arrival_time: s.start + ":00" } } });
}
