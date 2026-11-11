import { reviewSchedule, schedulePlanningAgent, scheduleRecoveryAgent } from "../../../server/schedule-review";
import { evaluateSchedule } from "../../../lib/schedule-rules";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 32768) return Response.json({ error: "The schedule is too large." }, { status: 400 });
    let input: unknown;
    try { input = JSON.parse(text); evaluateSchedule(input); }
    catch { return Response.json({ error: "Enter a valid event date, start and end time, and vendor schedules." }, { status: 400 }); }
    try { return Response.json(await reviewSchedule(input, schedulePlanningAgent, scheduleRecoveryAgent, request.signal), { headers: { "Cache-Control": "no-store" } }); }
    catch {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      const fallback = evaluateSchedule(input);
      return Response.json({ error: "AI suggestions are unavailable right now. You can still review the timing findings below.", issues: fallback.issues }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  } catch { return Response.json({ error: "The schedule check could not finish." }, { status: 500 }); }
}
