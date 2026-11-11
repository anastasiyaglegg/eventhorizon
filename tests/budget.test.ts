import assert from "node:assert/strict";
import test from "node:test";
import { amountCents, budgetSummary, buildBudgetFindings, suggestCategoryBudgets } from "../src/lib/budget";

test("budget counts selected vendors once and keeps missing estimates visible", () => {
  const result = budgetSummary({
    selections: { venue: "venue-1", catering: "food-1", bakery: "food-1", florist: "flowers-1" },
    vendorEstimates: { "venue-1": "1500.50", "food-1": "899.99", "removed": "9999" },
    budgetLimit: "3000",
  });
  assert.deepEqual(result, { estimatedCents: 240049, limitCents: 300000, remainingCents: 59951, assignedCents: 0, unassignedCents: 300000, unknownCount: 1, startingPriceCount: 0 });
});

test("budget can show a shortfall without inventing missing prices", () => {
  assert.deepEqual(budgetSummary({ selections: { venue: "v" }, vendorEstimates: { v: "75" }, budgetLimit: "50" }),
    { estimatedCents: 7500, limitCents: 5000, remainingCents: -2500, assignedCents: 0, unassignedCents: 5000, unknownCount: 0, startingPriceCount: 0 });
});

test("listed starting prices flow into the chosen plan, while entered estimates take priority", () => {
  const plan = { selections: { venue: "v", catering: "c" }, vendorEstimates: { c: "1300" }, categoryBudgets: { venue: "900", catering: "1200" }, budgetLimit: "2000" };
  const prices = [{ id: "v", priceMin: 1000 }, { id: "c", priceMin: 800 }];
  const summary = budgetSummary(plan, prices);
  assert.equal(summary.estimatedCents, 230000);
  assert.equal(summary.startingPriceCount, 1);
  assert.deepEqual(buildBudgetFindings(plan, prices).filter(item => item.tone === "needs-action").map(item => item.id), ["budget-over", "budget-allocated", "category-over:venue", "category-over:catering"]);
});

test("suggested category budgets fill empty amounts without overwriting a person's choices", () => {
  const plan = { selections: { venue: "v" }, vendorEstimates: {}, categoryBudgets: { venue: "1500" }, budgetLimit: "3000" };
  const result = suggestCategoryBudgets(plan, [{ service: "venue", priceMin: 1000 }, { service: "catering", priceMin: 800 }, { service: "florist", priceMin: 300 }]);
  assert.equal(result.budgets.venue, "1500");
  assert.equal(result.budgets.catering, "960.00");
  assert.equal(result.budgets.florist, "460.00");
  assert.equal(result.suggested.catering, 96000);
  assert.deepEqual(result.unfilled, []);
  assert.equal(budgetSummary({ ...plan, categoryBudgets: result.budgets }).unassignedCents, 8000);
});

test("unknown listing prices get a labeled planning allowance when the event has room", () => {
  const plan = { selections: {}, vendorEstimates: {}, categoryBudgets: {}, budgetLimit: "1000" };
  const result = suggestCategoryBudgets(plan, [{ service: "florist", priceMin: null }, { service: "catering", priceMin: 500 }]);
  assert.equal(result.budgets.florist, "200.00");
  assert.equal(result.budgets.catering, "700.00");
  assert.deepEqual(result.unfilled, []);
});

test("category budgets add once and show the amount left to assign", () => {
  const result = budgetSummary({ selections: {}, vendorEstimates: {}, budgetLimit: "5000", categoryBudgets: { venue: "2000", catering: "1250.50", florist: "400" } });
  assert.equal(result.assignedCents, 365050);
  assert.equal(result.unassignedCents, 134950);
  assert.equal(result.estimatedCents, 0);
});

test("unfinished decimal estimates use the listed starting price in both planning views", () => {
  assert.equal(amountCents("500."), null);
  const summary = budgetSummary({ selections: { catering: "c" }, vendorEstimates: { c: "500." }, budgetLimit: "1000" }, [{ id: "c", priceMin: 200 }]);
  assert.equal(summary.estimatedCents, 20000);
  assert.equal(summary.startingPriceCount, 1);
});

test("category budget findings use the readable service label", () => {
  const findings = buildBudgetFindings({ selections: { av: "a" }, vendorEstimates: { a: "500" }, categoryBudgets: { av: "300" }, budgetLimit: "1000" }, []);
  const finding = findings.find(item => item.id === "category-over:av")!;
  assert.match(finding.title, /^AV exceeds/);
  assert.match(finding.detail, /assigned to AV/);
});
