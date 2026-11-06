import { test } from "node:test";
import assert from "node:assert/strict";
import { seededInput } from "../src/lib/seed";
import { calculateImpact } from "../src/lib/time";
import {
  buildAnalysisInput,
  dependentTasks,
  formatClock,
  normalizeArrivalInput,
} from "../src/lib/review";

test("review input preserves the seeded event while changing only the proposal", () => {
  const input = buildAnalysisInput(seededInput.snapshot.event, "16:00:00");

  assert.equal(input.snapshot.event.vendor.arrival_time, "16:00:00");
  assert.equal(input.snapshot.proposed_change.proposed_arrival_time, "16:00:00");
  assert.deepEqual(
    dependentTasks(input.snapshot.event).map((task) => task.task_id),
    ["catering-ready"],
  );
});

test("review helpers present normal and late deterministic cases", () => {
  const normal = calculateImpact(buildAnalysisInput(seededInput.snapshot.event, "16:00:00"));
  const late = calculateImpact(buildAnalysisInput(seededInput.snapshot.event, "17:00:00"));

  assert.equal(normal.setup_finish, "2026-11-20T17:30:00.000-05:00");
  assert.equal(normal.overlap_minutes, 0);
  assert.equal(late.setup_finish, "2026-11-20T18:30:00.000-05:00");
  assert.equal(late.overlap_minutes, 30);
  assert.deepEqual(late.affected_task_ids, ["catering-ready"]);
  assert.equal(formatClock(late.setup_finish), "18:30");
  assert.equal(formatClock("00:00:00"), "00:00");
});

test("review helpers keep missing arrival unknown and enforce whole minutes", () => {
  const missing = calculateImpact(buildAnalysisInput(seededInput.snapshot.event, null));

  assert.equal(missing.setup_finish, null);
  assert.equal(missing.overlap_minutes, null);
  assert.match(missing.unknowns[0], /arrival/);
  assert.equal(normalizeArrivalInput("17:00"), "17:00:00");
  assert.equal(normalizeArrivalInput(""), null);
  assert.throws(() => normalizeArrivalInput("17:00:30"), /HH:MM/);
});
