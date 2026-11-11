import { test } from "node:test";
import assert from "node:assert/strict";
import { findScheduleOverlaps, overlapsForOtherEvent, validSchedule } from "../src/lib/schedule-conflicts";
const a = { id: "one", name: "Florist", slot: { date: "2026-11-20", start: "15:00", end: "16:00" } };
test("finds same-date overlaps and excludes the same record", () => {
  const b = { id: "two", name: "Caterer", slot: { ...a.slot, start: "15:30", end: "16:30" } };
  assert.deepEqual(findScheduleOverlaps(a, [a, b]), [b]);
});
test("allows touching boundaries and different dates", () => {
  assert.equal(findScheduleOverlaps(a, [{ id: "two", name: "DJ", slot: { ...a.slot, start: "16:00", end: "17:00" } }, { id: "three", name: "Event", slot: { ...a.slot, date: "2026-11-21" } }]).length, 0);
});
test("rejects missing, overnight and malformed times", () => {
  assert.equal(validSchedule({ date: "", start: "15:00", end: "16:00" }), false);
  assert.equal(validSchedule({ date: "2026-11-20", start: "23:00", end: "01:00" }), false);
  assert.equal(findScheduleOverlaps(a, [{ id: "bad", name: "Bad", slot: { ...a.slot, start: "25:00" } }]).length, 0);
  assert.equal(validSchedule({ date: "2026-02-30", start: "15:00", end: "16:00" }), false);
  assert.equal(validSchedule({ date: "2026-03-08", start: "02:15", end: "03:15" }), false);
  assert.equal(validSchedule({ date: "2026-11-01", start: "01:15", end: "02:15" }), false);
});
test("an other event checks planned vendors as well as other events", () => {
  const event = { id: "event-two", name: "Staff briefing", slot: { ...a.slot, start: "15:30", end: "16:30" } };
  assert.deepEqual(overlapsForOtherEvent(event, [], [a]), [a]);
});
