import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/server/analyze";
import { handleAnalysis } from "../src/server/http";
import { callAnthropic } from "../src/server/anthropic";
import { seededInput } from "../src/lib/seed";
import { AnalysisError, type AnalysisOutput, type Calculation } from "../src/lib/contract";
import { calculateImpact } from "../src/lib/time";
import { beginAnalysis, clearProposal, createSession, decide, receiveAnalysis } from "../src/lib/session";

function fixture(calculation: Calculation): AnalysisOutput {
  return {
    agent: "planning", contract_version: "planning.v1", status: "ok",
    affected_task_ids: calculation.affected_task_ids,
    scheduling_risks: calculation.affected_task_ids.length ? [{
      type: "potential_schedule_conflict",
      description: "Catering readiness needs review.",
      task_ids: calculation.affected_task_ids,
      evidence: [{ source: "calculation", field: "setup_finish" }],
    }] : [],
    unknowns: calculation.unknowns,
    recommendation: { action: "Review the supplied event facts.", task_ids: calculation.affected_task_ids },
  };
}

test("normal arrival leaves the event and unrelated tasks unaffected", async () => {
  const input = structuredClone(seededInput);
  input.snapshot.proposed_change.proposed_arrival_time = "16:00:00";
  let calls = 0;
  const packet = await analyze(input, async (_, calculation) => { calls++; return fixture(calculation); });
  assert.equal(calls, 1);
  assert.equal(packet.calculation.setup_finish, "2026-11-20T17:30:00.000-05:00");
  assert.equal(packet.calculation.overlap_minutes, 0);
  assert.deepEqual(packet.analysis.affected_task_ids, []);
});

test("late arrival produces the 30-minute overlap and only the dependent task", async () => {
  const packet = await analyze(seededInput, async (_, calculation) => fixture(calculation));
  assert.equal(packet.calculation.overlap_minutes, 30);
  assert.deepEqual(packet.analysis.affected_task_ids, ["catering-ready"]);
  assert.equal(seededInput.snapshot.event.vendor.arrival_time, "16:00:00");
});

test("missing setup stays unknown and prevents invented time calculations", async () => {
  const input = structuredClone(seededInput);
  input.snapshot.event.vendor.setup_duration_minutes = null;
  const packet = await analyze(input, async (_, calculation) => ({ ...fixture(calculation), unknowns: [] }));
  assert.equal(packet.calculation.setup_finish, null);
  assert.equal(packet.calculation.overlap_minutes, null);
  assert.match(packet.analysis.unknowns[0], /setup duration/);
});

test("invalid dates and ambiguous DST times fail before the model call", async () => {
  for (const [date, time] of [["2026-02-30", "17:00:00"], ["2026-11-01", "01:30:00"], ["2026-03-08", "02:30:00"]]) {
    const input = structuredClone(seededInput);
    input.snapshot.event.event_date = date;
    input.snapshot.proposed_change.proposed_arrival_time = time;
    await assert.rejects(analyze(input, async () => assert.fail("must not call provider")),
      (error: AnalysisError) => error.code === "invalid_input");
  }
});

test("setup can cross midnight with the calculated date preserved", () => {
  const input = structuredClone(seededInput);
  input.snapshot.proposed_change.proposed_arrival_time = "23:00:00";
  assert.equal(calculateImpact(input).setup_finish, "2026-11-21T00:30:00.000-05:00");
});

test("unknown task IDs and fabricated evidence block the report", async () => {
  for (const invalid of ["task", "evidence"]) {
    await assert.rejects(analyze(seededInput, async (_, calculation) => {
      const output = fixture(calculation);
      if (invalid === "task") output.affected_task_ids.push("invented");
      else output.scheduling_risks[0].evidence = [{ source: "vendor", id: "invented", field: "arrival_time" }];
      return output;
    }), (error: AnalysisError) => error.code === "invalid_output");
  }
});

test("HTTP entry point rejects malformed JSON and exposes only a safe error", async () => {
  let calls = 0;
  const provider = async () => { calls++; throw new Error("private provider details"); };
  const bad = await handleAnalysis(new Request("http://localhost/api/analyze", { method: "POST", body: "{" }), provider);
  assert.equal(bad.status, 400);
  assert.equal(calls, 0);
  const response = await handleAnalysis(new Request("http://localhost/api/analyze", {
    method: "POST", body: JSON.stringify(seededInput),
  }), provider);
  assert.equal(response.status, 502);
  assert.ok(!JSON.stringify(await response.json()).includes("private provider details"));
});

test("session approval requires a current successful report and applies at most once", async () => {
  const packet = await analyze(seededInput, async (_, calculation) => fixture(calculation));
  const initial = createSession(seededInput.snapshot.event);
  assert.throws(() => decide(initial, "approve"));
  const pending = beginAnalysis(initial, "17:00:00", "request-1");
  assert.equal(receiveAnalysis(pending, "old-request", packet), pending);
  const ready = receiveAnalysis(pending, "request-1", packet);
  const approved = decide(ready, "approve");
  assert.equal(approved.event.vendor.arrival_time, "17:00:00");
  assert.equal(initial.event.vendor.arrival_time, "16:00:00");
  assert.throws(() => decide(approved, "approve"));
  assert.equal(decide(ready, "reject").event.vendor.arrival_time, "16:00:00");
  assert.throws(() => decide(clearProposal(ready), "approve"));
});

test("editing while a request is pending prevents an older response from enabling approval", async () => {
  const packet = await analyze(seededInput, async (_, calculation) => fixture(calculation));
  const pending = beginAnalysis(createSession(seededInput.snapshot.event), "17:00:00", "request-1");
  const edited = clearProposal(pending);
  assert.equal(receiveAnalysis(edited, "request-1", packet), edited);
  assert.throws(() => decide(edited, "approve"));
});

test("Anthropic adapter makes one Opus medium request and never retries a provider error", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousModel = process.env.ANTHROPIC_MODEL;
  process.env.ANTHROPIC_API_KEY = "local-fixture-key";
  delete process.env.ANTHROPIC_MODEL;
  let calls = 0;
  globalThis.fetch = async (request, init) => {
    calls++;
    const body = request instanceof Request ? await request.json() : JSON.parse(String(init?.body));
    assert.equal(body.model, "claude-opus-4-6");
    assert.equal(body.output_config.effort, "medium");
    assert.equal(body.output_config.format.type, "json_schema");
    assert.ok(body.output_config.format.schema.properties.scheduling_risks);
    assert.equal(body.thinking.type, "adaptive");
    return new Response('{"error":{"type":"overloaded_error","message":"private"}}', {
      status: 529, headers: { "content-type": "application/json" },
    });
  };
  try {
    await assert.rejects(callAnthropic(seededInput, calculateImpact(seededInput)),
      (error: AnalysisError) => error.code === "provider_error" && !error.message.includes("private"));
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = previousModel;
  }
});

test("HTTP-to-SDK success produces a review packet using one simulated model response", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "local-fixture-key";
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({
      id: "fixture", type: "message", role: "assistant", model: "claude-opus-4-6",
      stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "text", text: JSON.stringify(fixture(calculateImpact(seededInput))) }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  };
  try {
    const response = await handleAnalysis(new Request("http://localhost/api/analyze", {
      method: "POST", body: JSON.stringify(seededInput),
    }), callAnthropic);
    assert.equal(response.status, 200);
    const packet = await response.json();
    assert.equal(packet.calculation.overlap_minutes, 30);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});
