import assert from "node:assert/strict";
import test from "node:test";
import { PATCH, POST, PUT } from "../src/app/api/plans/route";

const id = "00000000-0000-4000-8000-000000000001";
const token = "a".repeat(64);
const plan = {
  name: "Moonlight party", themeId: "moonlight-masquerade", selections: {}, vendorSlots: {},
  vendorStatuses: {}, vendorEstimates: {}, budgetLimit: "3000", otherEvents: [],
  eventDate: "2026-11-20", eventStart: "18:00", eventEnd: "20:00", eventGuests: "80",
};
const request = (method: string, body: unknown) => new Request("http://localhost/api/plans", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("shared plans create, load, and update through capability functions", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test-key";
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    if (url.endsWith("create_event_plan")) return Response.json([{ plan_id: id, edit_token: token, version: 1 }]);
    if (url.endsWith("get_event_plan")) return Response.json([{ plan, version: 1 }]);
    return Response.json([{ version: 2 }]);
  };
  try {
    assert.deepEqual(await (await POST(request("POST", { plan }))).json(), { id, token, version: 1 });
    assert.deepEqual(await (await PATCH(request("PATCH", { id, token }))).json(), { plan, version: 1 });
    assert.deepEqual(await (await PUT(request("PUT", { id, token, version: 1, plan }))).json(), { version: 2 });
    assert.deepEqual(calls.map(call => call.url.split("/").at(-1)), ["create_event_plan", "get_event_plan", "update_event_plan"]);
    assert.equal(calls[2].body.p_expected_version, 1);
    assert.equal(calls[2].body.p_edit_token, token);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

test("shared plan rejects invalid input and prevents stale overwrites", async () => {
  const invalid = await POST(request("POST", { plan: { ...plan, name: "x".repeat(121) } }));
  assert.equal(invalid.status, 400);
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test-key";
  globalThis.fetch = async () => Response.json([]);
  try {
    const stale = await PUT(request("PUT", { id, token, version: 1, plan }));
    assert.equal(stale.status, 409);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});
