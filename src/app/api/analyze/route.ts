import { callAnthropic } from "../../../server/anthropic";
import { handleAnalysis } from "../../../server/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleAnalysis(request, callAnthropic);
}
