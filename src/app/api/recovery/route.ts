import { callRecoveryAgent } from "../../../server/recovery-agent";
import { handleRecovery } from "../../../server/recovery-http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleRecovery(request, callRecoveryAgent);
}
