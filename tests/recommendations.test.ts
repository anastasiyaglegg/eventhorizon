import assert from "node:assert/strict";
import test from "node:test";
import { recommend } from "../src/server/recommendations";
import type { RecommendationInput, RecommendationCandidate } from "../src/lib/recommendations";
import { sampleVendors } from "../src/lib/vendor-search";

const item = (id: string, service: RecommendationCandidate["service"], priceMin: number | null, capacityMax: number | null): RecommendationCandidate =>
  ({ id, service, priceMin, capacityMin: null, capacityMax, rating: null, isSynthetic: false });
const candidates = [
  item("venue-fit", "venue", 2000, 120), item("venue-small", "venue", 1000, 40),
  item("caterer", "catering", 1500, 100), item("caterer-two", "catering", 1000, 100),
  item("florist", "florist", null, null), item("dj", "entertainment", 5000, 100),
];
const input: RecommendationInput = { phase: "venue", budget: 5000, guests: 80, candidates };

test("venue suggestions exclude listings that cannot fit the guests or budget", async () => {
  const result = await recommend(input, async ({ candidates: pool }) => {
    assert.deepEqual(pool.map(item => item.id), ["venue-fit"]);
    return { ids: ["venue-fit"] };
  });
  assert.equal(result.source, "ai");
  assert.deepEqual(result.ids, ["venue-fit"]);
  assert.match(result.snapshot_hash, /^[a-f0-9]{64}$/);
});

test("stack rejects repeated categories and a known over-budget combination", async () => {
  const stack: RecommendationInput = { ...input, phase: "vendors", venueId: "venue-fit" };
  await assert.rejects(recommend(stack, async () => ({ ids: ["caterer", "caterer-two"] })), /repeated a vendor category/);
  await assert.rejects(recommend(stack, async () => ({ ids: ["caterer", "dj"] })), /unknown or repeated vendor/);
  await assert.rejects(recommend({ ...stack, budget: 6000 }, async () => ({ ids: ["caterer", "dj"] })), /unknown or repeated vendor/);
});

test("stack permits unknown prices but never claims a confirmed booking", async () => {
  const stack: RecommendationInput = { ...input, phase: "vendors", venueId: "venue-fit" };
  const result = await recommend(stack, async () => ({ ids: ["caterer", "florist"] }));
  assert.deepEqual(result.ids, ["caterer", "florist"]);
  assert.match(result.note, /confirmation/);
});

test("directory fallback is distinctly labeled when no AI key is configured", async () => {
  const result = await recommend(input);
  assert.equal(result.source, "directory");
  assert.deepEqual(result.ids, ["venue-fit"]);
});

test("demo directory has ten clearly fictional choices in every category", () => {
  const services = ["venue", "catering", "florist", "entertainment", "bakery", "av", "photography", "decorator"];
  for (const service of services) {
    assert.equal(sampleVendors.filter(vendor => vendor.service === service).length, 10, service);
  }
  assert.ok(sampleVendors.every(vendor => vendor.isSynthetic && vendor.sourceUrl === null));
});

test("vendor group covers all available categories and skips categories already chosen", async () => {
  const services: RecommendationCandidate["service"][] = ["catering", "florist", "entertainment", "bakery", "av", "photography", "decorator"];
  const all = [item("venue", "venue", 1000, 100), ...services.map(service => item(service, service, 100, 100))];
  const result = await recommend({ phase: "vendors", budget: 2500, guests: 80, venueId: "venue", candidates: all });
  assert.equal(result.ids.length, 7);
  const remaining = await recommend({ phase: "vendors", budget: 2500, guests: 80, venueId: "venue", selectedServices: ["photography"], candidates: all });
  assert.equal(remaining.ids.length, 6);
  assert.ok(!remaining.ids.includes("photography"));
});

test("an AI shortlist hands affordable missing categories to the directory without changing its choice", async () => {
  const services: RecommendationCandidate["service"][] = ["catering", "florist", "entertainment", "bakery", "av", "photography", "decorator"];
  const all = [item("venue", "venue", 1000, 100), ...services.map(service => item(service, service, 100, 100))];
  const result = await recommend({ phase: "vendors", budget: 2500, guests: 80, venueId: "venue", candidates: all }, async () => ({ ids: ["florist"] }));
  assert.equal(result.source, "ai");
  assert.equal(result.ids[0], "florist");
  assert.equal(result.ids.length, 7);
  assert.match(result.note, /filled from the directory/);
});

test("selected venue must fit the known guest capacity before a group is recommended", async () => {
  await assert.rejects(recommend({ phase: "vendors", budget: 7000, guests: 400, venueId: "venue-small", candidates }), /chosen venue does not fit/);
});

test("venue borough and category budgets shape the vendor group", async () => {
  const local = { ...item("florist-local", "florist", 500, 100), borough: "Brooklyn" };
  const distant = { ...item("florist-far", "florist", 100, 100), borough: "Queens" };
  const venue = { ...item("venue", "venue", 1000, 100), borough: "Brooklyn" };
  const result = await recommend({ phase: "vendors", budget: 2500, guests: 80, venueId: "venue", candidates: [venue, local, distant] });
  assert.deepEqual(result.ids, ["florist-local"]);
  const capped = await recommend({ phase: "vendors", budget: 2500, guests: 80, venueId: "venue", categoryBudgets: { florist: 200 }, candidates: [venue, local, distant] });
  assert.deepEqual(capped.ids, ["florist-far"]);
});

test("existing vendors and category allocations are included in budget checks", async () => {
  const group = [item("venue", "venue", 1000, 100), item("already", "photography", 900, 100), item("florist", "florist", 500, 100)];
  await assert.rejects(recommend({ phase: "vendors", budget: 2000, guests: 80, venueId: "venue", selectedServices: ["photography"], selectedVendorIds: ["already"], candidates: group }), /No directory listings/);
  await assert.rejects(recommend({ phase: "vendors", budget: 2000, guests: 80, venueId: "venue", categoryBudgets: { venue: 1500, florist: 700 }, candidates: group }), /Assigned vendor budgets/);
});

test("money reserved for other categories cannot be spent by a suggested group", async () => {
  const listings = [item("venue", "venue", 1000, 100), item("catering", "catering", 1800, 100), item("florist", "florist", 200, 100)];
  const request: RecommendationInput = { phase: "vendors", budget: 3000, guests: 80, venueId: "venue", categoryBudgets: { venue: 1000, photography: 1000 }, candidates: listings };
  const result = await recommend(request);
  assert.deepEqual(result.ids, ["florist"]);
  await recommend(request, async ({ availableBudget, candidates: pool }) => {
    assert.equal(availableBudget, 1000);
    assert.deepEqual(pool.map(candidate => candidate.id), ["florist"]);
    return { ids: ["florist"] };
  });
});

test("recommendations honor a budget down to the cent", async () => {
  const prices = [item("venue", "venue", 1000.10, 100), item("florist", "florist", 200.20, 100)];
  await assert.rejects(recommend({ phase: "vendors", budget: 1200.29, guests: 80, venueId: "venue", candidates: prices }), /No directory listings/);
  const result = await recommend({ phase: "vendors", budget: 1200.30, guests: 80, venueId: "venue", candidates: prices });
  assert.deepEqual(result.ids, ["florist"]);
});
