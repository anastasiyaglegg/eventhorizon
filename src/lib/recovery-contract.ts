import { z } from "zod";
import { analysisInputSchema, analysisOutputSchema } from "./contract";

const id = z.string().min(1).max(80);
const evidenceSchema = z.object({
  source: z.enum(["event", "vendor", "task", "proposed_change", "calculation"]),
  id: id.optional(),
  field: z.string().min(1).max(80),
}).strict();

const calculationSchema = z.object({
  setup_finish: z.string().nullable(),
  overlap_minutes: z.number().int().nonnegative().nullable(),
  affected_task_ids: z.array(id).max(50),
  unknowns: z.array(z.string().min(1).max(500)).max(30),
}).strict();

const proposedTaskSchema = z.object({
  title: z.string().min(1).max(160),
  reason: z.string().min(1).max(500),
  owner_role: z.enum(["event_coordinator", "event_manager"]),
  priority: z.enum(["low", "normal", "high"]),
  source_risk_indices: z.array(z.number().int().min(0).max(49)).min(1).max(5),
  task_ids: z.array(id).max(50),
  evidence: z.array(evidenceSchema).min(1).max(20),
}).strict();

export const recoveryInputSchema = z.object({
  contract_version: z.literal("recovery.v1"),
  run_id: z.string().uuid(),
  source_run_id: z.string().uuid(),
  event: analysisInputSchema.shape.snapshot.shape.event,
  proposed_arrival_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:00$/).nullable(),
  analysis: analysisOutputSchema,
}).strict();

export const recoveryOutputSchema = z.object({
  agent: z.literal("recovery"),
  contract_version: z.literal("recovery.v1"),
  status: z.literal("ok"),
  run_id: z.string().uuid(),
  source_run_id: z.string().uuid(),
  proposed_tasks: z.array(proposedTaskSchema).max(8),
}).strict();

export type RecoveryInput = z.infer<typeof recoveryInputSchema>;
export type RecoveryOutput = z.infer<typeof recoveryOutputSchema>;
export type ProposedRecoveryTask = z.infer<typeof proposedTaskSchema>;

export class RecoveryError extends Error {
  constructor(public code: "invalid_input" | "invalid_output" | "provider_error" | "provider_timeout" | "provider_not_configured", message: string) {
    super(message);
  }
}
