import { analyze, type AnalysisProvider } from "./analyze";
import { AnalysisError } from "../lib/contract";

export async function handleAnalysis(request: Request, provider: AnalysisProvider): Promise<Response> {
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 32768) {
      throw new AnalysisError("invalid_input", "The event input is too large.");
    }
    let input: unknown;
    try { input = JSON.parse(body); }
    catch { throw new AnalysisError("invalid_input", "Send a valid JSON event and arrival change."); }
    return Response.json(await analyze(input, provider, request.signal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    const known = error instanceof AnalysisError ? error : new AnalysisError("provider_error", "Analysis could not finish.");
    const status = { invalid_input: 400, invalid_output: 502, provider_error: 502,
      provider_timeout: 504, provider_not_configured: 503 }[known.code];
    return Response.json({
      agent: "planning", contract_version: "planning.v1", status: "error",
      error: { code: known.code, message: known.message, details: null },
    }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
