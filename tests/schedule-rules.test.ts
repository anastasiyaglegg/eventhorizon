import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSchedule } from "../src/lib/schedule-rules";
import { reviewSchedule } from "../src/server/schedule-review";
const event = { date: "2026-11-20", start: "18:00", end: "20:00" };
const vendor = (category: string, start: string, end: string, date = event.date) => ({ id: `${category}-1`, name: `Example ${category}`, category, slot: { date, start, end } });
const check = (...vendors: ReturnType<typeof vendor>[]) => evaluateSchedule({ version: "schedule-review.v1", event, vendors }).issues;

test("catering and bakery 1–3 hour boundaries before and after are inclusive", () => {
  for (const kind of ["catering", "bakery"]) {
    assert.deepEqual(check(vendor(kind, "15:00", "23:00")), []);
    assert.deepEqual(check(vendor(kind, "17:00", "21:00")), []);
    assert.deepEqual(check(vendor(kind, "14:59", "23:01")).map(i => i.code), ["catering_arrival", "catering_finish"]);
    assert.deepEqual(check(vendor(kind, "17:01", "20:59")).map(i => i.code), ["catering_arrival", "catering_finish"]);
  }
});
test("other vendors can arrive at most an hour early", () => {
  assert.deepEqual(check(vendor("av", "17:00", "20:00")), []);
  assert.equal(check(vendor("photography", "16:59", "20:00"))[0].code, "too_early");
});
test("florists and decorators may arrive up to three days before", () => {
  for (const kind of ["florist", "decorator"]) {
    assert.deepEqual(check(vendor(kind, "18:00", "19:00", "2026-11-17")), []);
    assert.equal(check(vendor(kind, "17:59", "19:00", "2026-11-17"))[0].code, "decor_too_early");
  }
});
test("missing slots and invalid dates are not treated as confirmed", () => {
  assert.equal(evaluateSchedule({ version: "schedule-review.v1", event, vendors: [{ id: "x", name: "Florist", category: "florist", slot: null }] }).issues[0].code, "missing_slot");
  assert.throws(() => evaluateSchedule({ version: "schedule-review.v1", event: { ...event, date: "2026-02-30" }, vendors: [vendor("av", "17:00", "20:00")] }));
  assert.throws(() => evaluateSchedule({ version: "schedule-review.v1", event: { ...event, start: "22:00", end: "01:00" }, vendors: [vendor("av", "17:00", "20:00")] }));
});
test("Planning hands checked issues to Recovery and binds the snapshot", async () => {
  const input = { version: "schedule-review.v1", event, vendors: [vendor("bakery", "17:30", "21:00")] };
  const result = await reviewSchedule(input, async ({ issues }) => ({ findings: issues.map(issue => ({ issue_id: issue.id, priority: "high" })) }), async ({ issues, planning }) => { assert.equal(planning?.findings.length, 1); return { suggestions: issues.map(issue => ({ issue_id: issue.id, action: "adjust_arrival" })) }; });
  assert.equal(result.issues[0].code, "catering_arrival"); assert.match(result.snapshot_hash, /^[a-f0-9]{64}$/); assert.equal(result.suggestions[0].text, "Review and adjust the vendor's arrival time.");
});
test("vendors who start after the event begins are flagged", () => {
  for (const kind of ["av", "photography", "entertainment", "florist", "decorator"]) {
    assert.deepEqual(check(vendor(kind, "18:30", "20:00")).map(i => i.code), ["late_arrival"]);
    assert.deepEqual(check(vendor(kind, "18:00", "20:00")), []);
  }
  // Caterers and bakers report it through their own arrival window, not twice.
  assert.deepEqual(check(vendor("catering", "18:30", "21:00")).map(i => i.code), ["catering_arrival"]);
});
test("no issues skips both agents and invalid or injected actions fail closed", async () => {
  const clean = { version: "schedule-review.v1", event, vendors: [vendor("av", "17:00", "20:00")] };
  let planningCalls = 0, recoveryCalls = 0;
  const result = await reviewSchedule(clean, async () => { planningCalls++; return { findings: [] }; }, async () => { recoveryCalls++; return { suggestions: [] }; });
  assert.equal(result.issues.length, 0); assert.equal(planningCalls, 0); assert.equal(recoveryCalls, 0);
  const bad = { ...clean, vendors: [vendor("bakery", "17:30", "21:00")] };
  await assert.rejects(reviewSchedule(bad, async () => ({ findings: [{ issue_id: "injected", priority: "high" }] }), async () => ({ suggestions: [] })));
  await assert.rejects(reviewSchedule(bad, async ({ issues }) => ({ findings: issues.map(issue => ({ issue_id: issue.id, priority: "high" })) }), async ({ issues }) => ({ suggestions: issues.map(issue => ({ issue_id: issue.id, action: "send_email" })) })));
});
