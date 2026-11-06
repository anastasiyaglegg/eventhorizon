import { z } from "zod";
import {
  analysisOutputSchema,
  type AnalysisInput,
  type ReviewPacket,
} from "../lib/contract";

const packetSchema = z.object({
  analysis: analysisOutputSchema,
  calculation: z.object({
    setup_finish: z.string().datetime({ offset: true }).nullable(),
    overlap_minutes: z.number().nonnegative().nullable(),
    affected_task_ids: z.array(z.string()),
    unknowns: z.array(z.string()),
  }).strict(),
  proposed_arrival_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:00$/).nullable(),
}).strict();

const errorSchema = z.object({
  status: z.literal("error"),
  error: z.object({ message: z.string().min(1).max(1000) }),
});

/** Fetch one report. Network and malformed-response errors remain recoverable. */
export async function requestAnalysis(
  input: AnalysisInput,
  signal: AbortSignal | undefined = undefined,
  fetcher: typeof fetch = fetch,
): Promise<ReviewPacket> {
  let response: Response;
  try {
    response = await fetcher("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Could not reach the analysis service. Please try again.");
  }

  let body: unknown;
  try { body = await response.json(); }
  catch { throw new Error("The analysis service returned an unreadable response. Please try again."); }

  if (!response.ok) {
    const result = errorSchema.safeParse(body);
    throw new Error(result.success ? result.data.error.message : "Analysis could not finish. Please try again.");
  }
  const result = packetSchema.safeParse(body);
  if (!result.success) {
    throw new Error("The impact report has an invalid format. Please try again.");
  }
  return result.data;
}
