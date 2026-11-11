import assert from "node:assert/strict";
import test from "node:test";
import { calendarExamples } from "../src/lib/calendar-examples";

test("fictional examples never land on a late-month event date", () => {
  for (const date of ["2026-12-25", "2026-12-30", "2026-02-27"]) {
    const examples = calendarExamples(date);
    assert.equal(examples.length, 3);
    assert.ok(examples.every(example => example.slot.date !== date), date);
    assert.ok(examples.every(example => example.slot.date.slice(0, 7) === date.slice(0, 7)), date);
  }
});
