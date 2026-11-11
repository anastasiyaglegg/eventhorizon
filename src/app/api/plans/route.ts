import { z } from "zod";
import { eventPlanSchema } from "../../../lib/plan-contract";

const credential = z.object({ id: z.uuid(), token: z.string().regex(/^[a-f0-9]{64}$/) });
const createInput = z.object({ plan: eventPlanSchema });
const readInput = credential;
const updateInput = credential.extend({ version: z.number().int().positive(), plan: eventPlanSchema });
const createOutput = z.array(z.object({ plan_id: z.uuid(), edit_token: z.string().regex(/^[a-f0-9]{64}$/), version: z.number().int().positive() })).length(1);
const readOutput = z.array(z.object({ plan: eventPlanSchema, version: z.number().int().positive() })).max(1);
const updateOutput = z.array(z.object({ version: z.number().int().positive() })).max(1);

async function callPlanFunction(name: string, args: Record<string, unknown>) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return { error: "Sharing is not connected yet.", status: 503 } as const;
  let url: URL;
  try { url = new URL(`/rest/v1/rpc/${name}`, base); }
  catch { return { error: "Sharing is not connected yet.", status: 503 } as const; }
  try {
    const response = await fetch(url, {
      method: "POST", cache: "no-store",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!response.ok) return { error: "The shared plan could not be reached. Try again shortly.", status: 502 } as const;
    return { data: await response.json() as unknown } as const;
  } catch { return { error: "The shared plan could not be reached. Try again shortly.", status: 502 } as const; }
}

async function bodyOf(request: Request): Promise<unknown> {
  try { return await request.json() as unknown; } catch { return null; }
}

export async function POST(request: Request) {
  const parsed = createInput.safeParse(await bodyOf(request));
  if (!parsed.success) return Response.json({ error: "The plan needs a few corrections before it can be shared." }, { status: 400 });
  const result = await callPlanFunction("create_event_plan", { p_plan: parsed.data.plan });
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  const output = createOutput.safeParse(result.data);
  if (!output.success) return Response.json({ error: "Sharing returned an unexpected result." }, { status: 502 });
  return Response.json({ id: output.data[0].plan_id, token: output.data[0].edit_token, version: output.data[0].version });
}

export async function PUT(request: Request) {
  const parsed = updateInput.safeParse(await bodyOf(request));
  if (!parsed.success) return Response.json({ error: "The plan needs a few corrections before saving." }, { status: 400 });
  const { id, token, version, plan } = parsed.data;
  const result = await callPlanFunction("update_event_plan", { p_plan_id: id, p_edit_token: token, p_expected_version: version, p_plan: plan });
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  const output = updateOutput.safeParse(result.data);
  if (!output.success) return Response.json({ error: "Saving returned an unexpected result." }, { status: 502 });
  if (!output.data.length) return Response.json({ error: "This plan changed elsewhere. Refresh it before saving again." }, { status: 409 });
  return Response.json({ version: output.data[0].version });
}

export async function PATCH(request: Request) {
  const parsed = readInput.safeParse(await bodyOf(request));
  if (!parsed.success) return Response.json({ error: "This share link is incomplete." }, { status: 400 });
  const result = await callPlanFunction("get_event_plan", { p_plan_id: parsed.data.id, p_edit_token: parsed.data.token });
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  const output = readOutput.safeParse(result.data);
  if (!output.success) return Response.json({ error: "The shared plan could not be read." }, { status: 502 });
  if (!output.data.length) return Response.json({ error: "This share link is no longer available." }, { status: 404 });
  return Response.json(output.data[0]);
}
