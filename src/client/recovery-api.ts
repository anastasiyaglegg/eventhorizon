import { recoveryOutputSchema, type RecoveryInput, type RecoveryOutput } from "../lib/recovery-contract";

export async function requestRecovery(input: RecoveryInput, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<RecoveryOutput> {
  const response = await fetcher("/api/recovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload &&
      payload.error && typeof payload.error === "object" && "message" in payload.error &&
      typeof payload.error.message === "string" ? payload.error.message : "Recovery suggestions could not be created.";
    throw new Error(message);
  }
  const result = recoveryOutputSchema.safeParse(payload);
  if (!result.success) throw new Error("Recovery suggestions returned an invalid format.");
  return result.data;
}
