import { ZodError } from "zod";
import { callRecommendationAgent, recommend } from "../../../server/recommendations";

export async function POST(request: Request) {
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 40_000) return Response.json({ error: "Too many vendor details were sent." }, { status: 413 });
    body = JSON.parse(text) as unknown;
  } catch {
    return Response.json({ error: "The recommendation request could not be read." }, { status: 400 });
  }
  try {
    const ranker = process.env.ANTHROPIC_API_KEY ? callRecommendationAgent : undefined;
    return Response.json(await recommend(body, ranker, request.signal));
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: "Enter a valid budget and guest count before requesting suggestions." }, { status: 400 });
    if (error instanceof Error && (error.message.startsWith("No directory") || error.message.startsWith("No vendor combination") || error.message.startsWith("Choose a venue") || error.message.startsWith("The chosen venue") || error.message.startsWith("Assigned vendor budgets"))) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return Response.json({ error: "AI suggestions are unavailable right now. You can still choose vendors yourself." }, { status: 502 });
  }
}
