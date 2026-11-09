import { calculateImpact } from "../lib/time";
import { analysisInputSchema } from "../lib/contract";
import { recoveryInputSchema, recoveryOutputSchema, RecoveryError, type RecoveryInput, type RecoveryOutput } from "../lib/recovery-contract";

export type RecoveryProvider = (input: RecoveryInput) => Promise<unknown>;

function validateSource(input: RecoveryInput) {
  const planningInput = analysisInputSchema.parse({
    contract_version: "planning.v1",
    snapshot: {
      event: input.event,
      proposed_change: {
        vendor_id: input.event.vendor.vendor_id,
        proposed_arrival_time: input.proposed_arrival_time,
      },
    },
  });
  const calculation = calculateImpact(planningInput);
  const taskIds = new Set(input.event.tasks.map(task => task.task_id));
  const dependentIds = new Set(input.event.tasks
    .filter(task => task.depends_on_vendor_ids.includes(input.event.vendor.vendor_id))
    .map(task => task.task_id));
  const affectedIds = new Set(calculation.affected_task_ids);
  const reportRefs = [
    ...input.analysis.affected_task_ids,
    ...input.analysis.recommendation.task_ids,
    ...input.analysis.scheduling_risks.flatMap(risk => risk.task_ids),
  ];
  if (reportRefs.some(id => !dependentIds.has(id)) ||
      input.analysis.affected_task_ids.some(id => !affectedIds.has(id)) ||
      calculation.affected_task_ids.some(id => !input.analysis.affected_task_ids.includes(id))) {
    throw new RecoveryError("invalid_input", "The Planning/Readiness findings do not match the supplied event.");
  }
  for (const risk of input.analysis.scheduling_risks) {
    for (const evidence of risk.evidence) {
      let record: Record<string, unknown> | undefined;
      switch (evidence.source) {
        case "event": record = input.event; break;
        case "vendor": if (evidence.id === input.event.vendor.vendor_id) record = input.event.vendor; break;
        case "task": record = input.event.tasks.find(task => task.task_id === evidence.id); break;
        case "proposed_change": record = planningInput.snapshot.proposed_change; break;
        case "calculation": record = calculation; break;
      }
      if (!record || !Object.hasOwn(record, evidence.field)) {
        throw new RecoveryError("invalid_input", "The Planning/Readiness report has an unsupported evidence reference.");
      }
    }
  }
  return { calculation, taskIds };
}

export async function proposeRecoveryTasks(value: unknown, provider: RecoveryProvider): Promise<RecoveryOutput> {
  const parsed = recoveryInputSchema.safeParse(value);
  if (!parsed.success) throw new RecoveryError("invalid_input", "The recovery request has an invalid format.");
  const input = parsed.data;
  let taskIds: Set<string>;
  try { ({ taskIds } = validateSource(input)); }
  catch (error) {
    if (error instanceof RecoveryError) throw error;
    throw new RecoveryError("invalid_input", "The event or Planning/Readiness report is invalid.");
  }
  if (input.analysis.scheduling_risks.length === 0) {
    return { agent: "recovery", contract_version: "recovery.v1", status: "ok", run_id: input.run_id, source_run_id: input.source_run_id, proposed_tasks: [] };
  }

  const result = recoveryOutputSchema.safeParse(await provider(structuredClone(input)));
  if (!result.success) throw new RecoveryError("invalid_output", "The Recovery Engine returned an invalid task plan.");
  if (result.data.run_id !== input.run_id || result.data.source_run_id !== input.source_run_id) {
    throw new RecoveryError("invalid_output", "The Recovery Engine returned mismatched run IDs.");
  }

  for (const suggestion of result.data.proposed_tasks) {
    const sourceRisks = suggestion.source_risk_indices.map(index => input.analysis.scheduling_risks[index]);
    if (sourceRisks.some(risk => !risk) || suggestion.task_ids.some(id => !taskIds.has(id))) {
      throw new RecoveryError("invalid_output", "A proposed task refers to an unsupported risk or event task.");
    }
    const sourceTaskIds = new Set(sourceRisks.flatMap(risk => risk.task_ids));
    const sourceEvidence = new Set(sourceRisks.flatMap(risk => risk.evidence.map(item => JSON.stringify(item))));
    if (suggestion.task_ids.some(id => !sourceTaskIds.has(id)) ||
        suggestion.evidence.some(item => !sourceEvidence.has(JSON.stringify(item)))) {
      throw new RecoveryError("invalid_output", "A proposed task contains unsupported task or evidence references.");
    }
  }
  return result.data;
}

export function sourceCalculation(value: unknown) {
  try { return validateSource(recoveryInputSchema.parse(value)).calculation; }
  catch (error) {
    if (error instanceof RecoveryError) throw error;
    throw new RecoveryError("invalid_input", "The recovery request has an invalid format.");
  }
}
