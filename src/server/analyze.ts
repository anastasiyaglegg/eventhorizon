import {
  analysisInputSchema, analysisOutputSchema, AnalysisError,
  type AnalysisInput, type Calculation, type ReviewPacket,
} from "../lib/contract";
import { calculateImpact } from "../lib/time";

export type AnalysisProvider = (input: AnalysisInput, calculation: Calculation) => Promise<unknown>;

export async function analyze(input: unknown, provider: AnalysisProvider): Promise<ReviewPacket> {
  const parsed = analysisInputSchema.safeParse(input);
  if (!parsed.success) throw new AnalysisError("invalid_input", "The event or arrival change has an invalid format.");
  const request = parsed.data;
  const calculation = calculateImpact(request);
  const result = analysisOutputSchema.safeParse(await provider(structuredClone(request), structuredClone(calculation)));
  if (!result.success) throw new AnalysisError("invalid_output", "The AI returned an invalid impact report. Please retry.");
  const output = result.data;
  const { event, proposed_change } = request.snapshot;
  const affected = new Set(calculation.affected_task_ids);
  const dependent = new Set(event.tasks.filter(t => t.depends_on_vendor_ids.includes(event.vendor.vendor_id)).map(t => t.task_id));
  const references = [
    ...output.affected_task_ids, ...output.recommendation.task_ids,
    ...output.scheduling_risks.flatMap(risk => risk.task_ids),
  ];
  if (references.some(id => !dependent.has(id)) ||
      output.affected_task_ids.some(id => !affected.has(id)) ||
      calculation.affected_task_ids.some(id => !output.affected_task_ids.includes(id))) {
    throw new AnalysisError("invalid_output", "The AI report references unsupported task impacts. Please retry.");
  }
  for (const risk of output.scheduling_risks) {
    for (const evidence of risk.evidence) {
      let record: Record<string, unknown> | undefined;
      switch (evidence.source) {
        case "event": record = event; break;
        case "vendor": if (evidence.id === event.vendor.vendor_id) record = event.vendor; break;
        case "task": record = event.tasks.find(task => task.task_id === evidence.id); break;
        case "proposed_change": record = proposed_change; break;
        case "calculation": record = calculation; break;
      }
      if (!record || !Object.hasOwn(record, evidence.field)) {
        throw new AnalysisError("invalid_output", "The AI report contains an unknown evidence reference. Please retry.");
      }
    }
  }
  output.unknowns = [...new Set([...calculation.unknowns, ...output.unknowns])];
  return { analysis: output, calculation, proposed_arrival_time: proposed_change.proposed_arrival_time };
}
