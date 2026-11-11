import assert from "node:assert/strict";
import test from "node:test";
import { amountCents, budgetAfterVendorChoice, budgetSummary, buildBudgetFindings, migrateLegacyBudgets, suggestCategoryBudgets } from "../src/lib/budget";

test("replacing a vendor resets its budget while a first choice keeps an entered amount", () => {
  assert.equal(budgetAfterVendorChoice("2100", "old-venue", "new-venue", 5200), "5200.00");
  assert.equal(budgetAfterVendorChoice("2100", "old-venue", "new-venue", null), "");
  assert.equal(budgetAfterVendorChoice("2500", undefined, "new-venue", 5200), "2500");
  assert.equal(budgetAfterVendorChoice(undefined, undefined, "new-venue", 5200), "5200.00");
});

test("category budgets alone determine planned spend and remaining money", () => {
  const plan = {
    selections: { venue: "venue-1", catering: "food-1", florist: "flowers-1" },
    vendorEstimates: { "venue-1": "9000", "food-1": "1" },
    categoryBudgets: { venue: "1500.50", catering: "899.99" },
    budgetLimit: "3000",
  };
  assert.deepEqual(budgetSummary(plan), { plannedCents: 240049, limitCents: 300000, remainingCents: 59951, unbudgetedCount: 1 });
});

test("overspending is counted once from the same category budgets shown on screen", () => {
  const plan = { selections: { venue: "v", catering: "c" }, vendorEstimates: {}, categoryBudgets: { venue: "1200", catering: "900" }, budgetLimit: "2000" };
  assert.equal(budgetSummary(plan).remainingCents, -10000);
  assert.deepEqual(buildBudgetFindings(plan, []).filter(item => item.tone === "needs-action").map(item => item.id), ["budget-over"]);
});

test("listed starting prices are references and never silently added to planned spend", () => {
  const plan = { selections: { venue: "v", catering: "c" }, vendorEstimates: {}, categoryBudgets: { venue: "900", catering: "800" }, budgetLimit: "2000" };
  assert.equal(budgetSummary(plan).plannedCents, 170000);
  const findings = buildBudgetFindings(plan, [{ id: "v", priceMin: 1000 }, { id: "c", priceMin: 700 }]);
  assert.deepEqual(findings.map(item => item.id), ["category-below-list:venue"]);
  assert.match(findings[0].detail, /above your \$900\.00 budget/);
});

test("suggested budgets fill empty categories without overwriting a person's amounts", () => {
  const plan = { selections: { venue: "v" }, vendorEstimates: {}, categoryBudgets: { venue: "1500" }, budgetLimit: "3000" };
  const result = suggestCategoryBudgets(plan, [{ service: "venue", priceMin: 1000 }, { service: "catering", priceMin: 800 }, { service: "florist", priceMin: 300 }]);
  assert.equal(result.budgets.venue, "1500");
  assert.equal(result.budgets.catering, "960.00");
  assert.equal(result.budgets.florist, "460.00");
  assert.equal(result.suggested.catering, 96000);
  assert.deepEqual(result.unfilled, []);
  assert.equal(budgetSummary({ ...plan, categoryBudgets: result.budgets }).remainingCents, 150000);
  assert.equal(budgetSummary({ ...plan, selections: { venue: "v", catering: "c", florist: "f" }, categoryBudgets: result.budgets }).remainingCents, 8000);
});

test("a category budget is not planned spend until a vendor is selected", () => {
  const plan = { selections: { venue: "v" }, vendorEstimates: {}, categoryBudgets: { venue: "1000", florist: "600" }, budgetLimit: "2000" };
  assert.equal(budgetSummary(plan).plannedCents, 100000);
  assert.equal(budgetSummary(plan).remainingCents, 100000);
  assert.equal(budgetSummary({ ...plan, selections: { venue: "v", florist: "f" } }).plannedCents, 160000);
  assert.equal(budgetSummary({ ...plan, selections: { venue: "v", florist: "f" } }).remainingCents, 40000);
});

test("an unchosen category does not take money from a suggested group", () => {
  const plan = { selections: { venue: "v" }, vendorEstimates: {}, categoryBudgets: { venue: "1000", florist: "600" }, budgetLimit: "2000" };
  const suggestion = suggestCategoryBudgets(plan, [{ service: "venue", priceMin: 1000 }, { service: "catering", priceMin: 500 }]);
  assert.equal(suggestion.budgets.catering, "900.00");
  assert.deepEqual(suggestion.unfilled, []);
});

test("unknown listing prices can receive a planning budget when there is room", () => {
  const plan = { selections: {}, vendorEstimates: {}, categoryBudgets: {}, budgetLimit: "1000" };
  const result = suggestCategoryBudgets(plan, [{ service: "florist", priceMin: null }, { service: "catering", priceMin: 500 }]);
  assert.equal(result.budgets.florist, "200.00");
  assert.equal(result.budgets.catering, "700.00");
  assert.deepEqual(result.unfilled, []);
});

test("legacy vendor estimates move into empty category budgets without replacing existing budgets", () => {
  const old = { selections: { venue: "v", catering: "c" }, vendorEstimates: { v: "1200", c: "800", removed: "9999" }, categoryBudgets: { venue: "1500" }, budgetLimit: "3000" };
  const migrated = migrateLegacyBudgets(old);
  assert.deepEqual(migrated.categoryBudgets, { venue: "1500", catering: "800.00" });
  assert.deepEqual(migrated.vendorEstimates, {});
  assert.equal(budgetSummary(migrated).plannedCents, 230000);
});

test("unfinished amounts stay unbudgeted and use readable service labels", () => {
  assert.equal(amountCents("500."), null);
  const plan = { selections: { av: "a" }, vendorEstimates: {}, categoryBudgets: { av: "500." }, budgetLimit: "1000" };
  assert.equal(budgetSummary(plan).unbudgetedCount, 1);
  const finding = buildBudgetFindings(plan, []).find(item => item.id === "category-missing:av")!;
  assert.match(finding.title, /budget for AV/);
});
