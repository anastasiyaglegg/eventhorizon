import { seededInput } from "../../../lib/seed";

export async function GET() {
  return Response.json(seededInput, { headers: { "Cache-Control": "no-store" } });
}
