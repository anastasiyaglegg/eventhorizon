import { z } from "zod";

const id = z.string().min(1).max(80);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/).nullable();
const taskSchema = z.object({
  task_id: id,
  name: z.string().min(1).max(200),
  start_time: time,
  end_time: time,
  depends_on_vendor_ids: z.array(id).max(10),
}).strict();

export const analysisInputSchema = z.object({
  contract_version: z.literal("planning.v1"),
  snapshot: z.object({
    event: z.object({
      name: z.string().min(1).max(200),
      event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time_zone: z.string().min(1).max(80),
      start_time: time,
      vendor: z.object({
        vendor_id: id,
        name: z.string().min(1).max(200),
        arrival_time: time,
        setup_duration_minutes: z.number().int().min(0).max(1440).nullable(),
      }).strict(),
      tasks: z.array(taskSchema).max(50),
    }).strict(),
    proposed_change: z.object({
      vendor_id: id,
      proposed_arrival_time: time,
    }).strict(),
  }).strict(),
}).strict();

const evidenceSchema = z.object({
  source: z.enum(["event", "vendor", "task", "proposed_change", "calculation"]),
  id: id.optional(),
  field: z.string().min(1).max(80),
}).strict();

export const analysisOutputSchema = z.object({
  agent: z.literal("planning"),
  contract_version: z.literal("planning.v1"),
  status: z.literal("ok"),
  affected_task_ids: z.array(id).max(50),
  scheduling_risks: z.array(z.object({
    type: z.enum(["potential_schedule_conflict", "missing_information"]),
    description: z.string().min(1).max(1000),
    task_ids: z.array(id).max(50),
    evidence: z.array(evidenceSchema).min(1).max(20),
  }).strict()).max(50),
  unknowns: z.array(z.string().min(1).max(500)).max(30),
  recommendation: z.object({
    action: z.string().min(1).max(1000),
    task_ids: z.array(id).max(50),
  }).strict(),
}).strict();

export type AnalysisInput = z.infer<typeof analysisInputSchema>;
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;
export type Calculation = {
  setup_finish: string | null;
  overlap_minutes: number | null;
  affected_task_ids: string[];
  unknowns: string[];
};
export type ReviewPacket = {
  analysis: AnalysisOutput;
  calculation: Calculation;
  proposed_arrival_time: string | null;
};
export type ErrorCode = "invalid_input" | "invalid_output" | "provider_error" |
  "provider_timeout" | "provider_not_configured";
export class AnalysisError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
}
