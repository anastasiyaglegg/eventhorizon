import assert from "node:assert/strict";
import test from "node:test";
import { budgetSummary } from "../src/lib/budget";

test("budget counts selected vendors once and keeps missing estimates visible", () => {
  const result = budgetSummary({
    selections: { venue: "venue-1", catering: "food-1", bakery: "food-1", florist: "flowers-1" },
    vendorEstimates: { "venue-1": "1500.50", "food-1": "899.99", "removed": "9999" },
    budgetLimit: "3000",
  });
  assert.deepEqual(result, { estimatedCents: 240049, limitCents: 300000, remainingCents: 59951, unknownCount: 1 });
});

test("budget can show a shortfall without inventing missing prices", () => {
  assert.deepEqual(budgetSummary({ selections: { venue: "v" }, vendorEstimates: { v: "75" }, budgetLimit: "50" }),
    { estimatedCents: 7500, limitCents: 5000, remainingCents: -2500, unknownCount: 0 });
});
