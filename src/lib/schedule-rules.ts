import { DateTime } from "luxon";
import { z } from "zod";

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const slot = z.object({ date: day, start: time, end: time }).strict();
export const scheduleReviewInputSchema = z.object({
  version: z.literal("schedule-review.v1"),
  event: z.object({ date: day, start: time, end: time }).strict(),
  vendors: z.array(z.object({ id: z.string().min(1).max(80), name: z.string().min(1).max(200), category: z.enum(["catering", "bakery", "florist", "decorator", "entertainment", "av", "photography"]), slot: slot.nullable() }).strict()).min(1).max(7),
}).strict();
export type ScheduleReviewInput = z.infer<typeof scheduleReviewInputSchema>;
export type ScheduleIssueCode = "missing_slot" | "catering_arrival" | "catering_finish" | "too_early" | "decor_too_early";
export type ScheduleIssue = { id: string; vendorId: string; vendorName: string; code: ScheduleIssueCode; message: string };

function local(date: string, time: string) {
  const value = DateTime.fromISO(`${date}T${time}`, { zone: "America/New_York" });
  if (!value.isValid || value.toISODate() !== date || value.toFormat("HH:mm") !== time || value.getPossibleOffsets().length !== 1) throw new Error("Enter valid, unambiguous dates and times in New York time.");
  return value;
}

/** Only the agreed arrival and finish rules are applied; no vendor availability is assumed. */
export function evaluateSchedule(value: unknown): { input: ScheduleReviewInput; issues: ScheduleIssue[] } {
  const input = scheduleReviewInputSchema.parse(value);
  const start = local(input.event.date, input.event.start), end = local(input.event.date, input.event.end);
  if (end <= start) throw new Error("Event end must be after event start on the same day.");
  if (new Set(input.vendors.map(v => v.id)).size !== input.vendors.length) throw new Error("A vendor can only appear once in the check.");
  const issues: ScheduleIssue[] = [];
  for (const vendor of input.vendors) {
    const add = (code: ScheduleIssueCode, message: string) => issues.push({ id: `${vendor.id}:${code}`, vendorId: vendor.id, vendorName: vendor.name, code, message });
    if (!vendor.slot) { add("missing_slot", `${vendor.name}: select a date and time.`); continue; }
    const arrival = local(vendor.slot.date, vendor.slot.start), finish = local(vendor.slot.date, vendor.slot.end);
    if (finish <= arrival) throw new Error("Vendor end times must be after start times on the same day.");
    const before = start.diff(arrival, "minutes").minutes;
    if (vendor.category === "catering" || vendor.category === "bakery") {
      const after = finish.diff(end, "minutes").minutes;
      if (before < 60 || before > 180) add("catering_arrival", `${vendor.name}: start must be 1–3 hours before the event starts.`);
      if (after < 60 || after > 180) add("catering_finish", `${vendor.name}: finish must be 1–3 hours after the event ends.`);
    } else if (vendor.category === "florist" || vendor.category === "decorator") {
      if (before > 72 * 60) add("decor_too_early", `${vendor.name}: start is more than 3 days before the event.`);
    } else if (before > 60) add("too_early", `${vendor.name}: start is more than 1 hour before the event.`);
  }
  return { input, issues };
}

export const scheduleIssueSchema = z.object({ id: z.string(), vendorId: z.string(), vendorName: z.string(), code: z.enum(["missing_slot", "catering_arrival", "catering_finish", "too_early", "decor_too_early"]), message: z.string() }).strict();
export const scheduleReviewResponseSchema = z.object({ version: z.literal("schedule-review.v1"), run_id: z.string().uuid(), snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/), issues: z.array(scheduleIssueSchema), findings: z.array(z.object({ issue_id: z.string(), priority: z.enum(["normal", "high"]) }).strict()), suggestions: z.array(z.object({ issue_id: z.string(), action: z.enum(["provide_schedule", "adjust_arrival", "adjust_finish", "confirm_schedule"]), text: z.string() }).strict()) }).strict();
export type ScheduleReviewResponse = z.infer<typeof scheduleReviewResponseSchema>;
