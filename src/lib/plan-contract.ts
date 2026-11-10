import { z } from "zod";

const clock = z.string().regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/);
const slot = z.object({ date: date, start: clock, end: clock });
const service = z.enum(["venue", "catering", "florist", "entertainment", "bakery", "av", "photography", "decorator"]);
const status = z.enum(["considering", "contacted", "confirmed"]);

export const eventPlanSchema = z.object({
  name: z.string().max(120),
  themeId: z.string().max(80),
  selections: z.partialRecord(service, z.string().max(80)),
  vendorSlots: z.record(z.string().max(80), slot),
  vendorStatuses: z.record(z.string().max(80), status),
  vendorEstimates: z.record(z.string().max(80), z.string().regex(/^$|^\d{1,8}(?:\.\d{1,2})?$/)),
  budgetLimit: z.string().regex(/^$|^\d{1,9}(?:\.\d{1,2})?$/),
  otherEvents: z.array(z.object({ id: z.string().max(80), name: z.string().max(120), slot })).max(100),
  eventDate: date,
  eventStart: clock,
  eventEnd: clock,
  eventGuests: z.string().regex(/^$|^\d{1,6}$/),
}).strict();

export type EventPlanData = z.infer<typeof eventPlanSchema>;
