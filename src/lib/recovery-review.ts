export type RecoveryTaskDecision = "kept" | "dismissed";
export type RecoveryTaskDecisions = Record<string, RecoveryTaskDecision>;

export function recoveryTaskDecisionKey(runId: string, taskIndex: number): string {
  return `${runId}:${taskIndex}`;
}

export function chooseRecoveryTask(
  decisions: RecoveryTaskDecisions,
  key: string,
  decision: RecoveryTaskDecision,
): RecoveryTaskDecisions {
  return { ...decisions, [key]: decision };
}

export function clearRecoveryTaskDecisions(): RecoveryTaskDecisions {
  return {};
}
