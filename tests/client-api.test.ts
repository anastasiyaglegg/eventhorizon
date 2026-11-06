import { test } from "node:test";
import assert from "node:assert/strict";
import { requestAnalysis } from "../src/client/analysis-api";
import { seededInput } from "../src/lib/seed";
import { handleAnalysis } from "../src/server/http";
import { createSession, beginAnalysis, receiveAnalysis, decide } from "../src/lib/session";

test("client receives a real handler report and can approve or reject the arrival", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "/api/analyze");
    return handleAnalysis(new Request("http://localhost/api/analyze", init), async (_, calculation) => {
      calls++;
      return {
        agent: "planning", contract_version: "planning.v1", status: "ok",
        affected_task_ids: calculation.affected_task_ids,
        scheduling_risks: [], unknowns: [],
        recommendation: { action: "Review the catering arrival.", task_ids: calculation.affected_task_ids },
      };
    });
  };
  const packet = await requestAnalysis(seededInput, new AbortController().signal, fetcher);
  assert.equal(calls, 1);
  assert.equal(packet.calculation.overlap_minutes, 30);
  const pending = beginAnalysis(createSession(seededInput.snapshot.event), "17:00:00", "client-request");
  const ready = receiveAnalysis(pending, "client-request", packet);
  assert.equal(decide(ready, "approve").event.vendor.arrival_time, "17:00:00");
  assert.equal(decide(ready, "reject").event.vendor.arrival_time, "16:00:00");
});

test("a successful HTTP status with an invalid report still blocks the client", async () => {
  const fetcher: typeof fetch = async () => Response.json({
    analysis: {
      agent: "planning", contract_version: "planning.v1", status: "ok",
      affected_task_ids: [], scheduling_risks: [], unknowns: [],
      recommendation: { action: "Review the arrival.", task_ids: [] },
    },
    proposed_arrival_time: "17:00:00",
  });
  await assert.rejects(
    requestAnalysis(seededInput, new AbortController().signal, fetcher),
    /invalid format/,
  );
});

test("provider error is shown to the coordinator and HTML failures are recoverable", async () => {
  const fetcher: typeof fetch = async () => Response.json({
    status: "error", error: { message: "AI analysis timed out. Please retry." },
  }, { status: 504 });
  await assert.rejects(requestAnalysis(seededInput, new AbortController().signal, fetcher), /timed out/);
  await assert.rejects(
    requestAnalysis(seededInput, new AbortController().signal, async () => new Response("<html>error</html>", { status: 502 })),
    /unreadable/,
  );
});
