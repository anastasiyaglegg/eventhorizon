import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTimeEntry } from "../src/lib/time-input";

test("four typed digits get a colon while partial and cleared input stay editable", () => {
  assert.equal(formatTimeEntry(""), "");
  assert.equal(formatTimeEntry("17"), "17");
  assert.equal(formatTimeEntry("170"), "17:0");
  assert.equal(formatTimeEntry("1700"), "17:00");
  assert.equal(formatTimeEntry("17:00"), "17:00");
  assert.equal(formatTimeEntry("9:30"), "09:30");
  assert.equal(formatTimeEntry("18 45"), "18:45");
  assert.equal(formatTimeEntry("25:00"), "25:00"); // Validation rejects it later.
});
