import { proposeRecoveryTasks, type RecoveryProvider } from "./recovery";
import { RecoveryError } from "../lib/recovery-contract";

export async function handleRecovery(request: Request, provider: RecoveryProvider): Promise<Response> {
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 32768) throw new RecoveryError("invalid_input", "The recovery request is too large.");
    let input: unknown;
    try { input = JSON.parse(body); }
    catch { throw new RecoveryError("invalid_input", "Send a valid recovery request."); }
    return Response.json(await proposeRecoveryTasks(input, provider, request.signal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    const known = error instanceof RecoveryError ? error : new RecoveryError("provider_error", "Recovery suggestions could not be created.");
    const status = { invalid_input: 400, invalid_output: 502, provider_error: 502, provider_timeout: 504, provider_not_configured: 503 }[known.code];
    return Response.json({ agent: "recovery", contract_version: "recovery.v1", status: "error", error: { code: known.code, message: known.message, details: null } }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
