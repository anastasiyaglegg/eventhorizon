import assert from "node:assert/strict";
import test from "node:test";
import { recommend } from "../src/server/recommendations";
import { selectRecommendationCandidates, selectedIdsInCandidates, type RecommendationInput, type RecommendationCandidate } from "../src/lib/recommendations";
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

test("a venue budget left behind without a venue cannot hide larger suitable venues", async () => {
  const venues = [item("small", "venue", 2100, 160), item("large", "venue", 5200, 300)];
  const result = await recommend({ phase: "venue", budget: 50000, guests: 200, categoryBudgets: { venue: 2100 }, candidates: venues });
  assert.deepEqual(result.ids, ["large"]);
});

test("server caps an AI venue shortlist at three", async () => {
  const venues = Array.from({ length: 4 }, (_, index) => item(`venue-${index}`, "venue", 1000, 100));
  const result = await recommend({ phase: "venue", budget: 5000, guests: 80, candidates: venues }, async () => ({ ids: venues.map(venue => venue.id) }));
  assert.deepEqual(result.ids, ["venue-0", "venue-1", "venue-2"]);
});

test("candidate cap keeps chosen listings and at most fifteen per service", () => {
  const services: RecommendationCandidate["service"][] = ["venue", "catering", "florist", "entertainment", "bakery", "av", "photography", "decorator"];
  const large = services.flatMap(service => Array.from({ length: 25 }, (_, index) => item(`${service}-${index}`, service, 100, 100)));
  const chosen = selectRecommendationCandidates(large, "venue-24", ["florist-24", "missing-id"]);
  assert.deepEqual(chosen.slice(0, 2).map(candidate => candidate.id), ["venue-24", "florist-24"]);
  assert.equal(chosen.length, 120);
  for (const service of services) assert.equal(chosen.filter(candidate => candidate.service === service).length, 15);
  assert.equal(chosen.some(candidate => candidate.id === "missing-id"), false);
  assert.deepEqual(selectedIdsInCandidates(["florist-24", "missing-id"], chosen), ["florist-24"]);
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
  assert.equal(new Set(sampleVendors.map(vendor => vendor.name.toLowerCase())).size, sampleVendors.length);
  assert.ok(sampleVendors.every(vendor => !vendor.name.includes("Silver Meridian")));
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

test("existing vendors and proposed category budgets are included when a listing is chosen", async () => {
  const group = [item("venue", "venue", 1000, 100), item("already", "photography", 900, 100), item("florist", "florist", 500, 100)];
  await assert.rejects(recommend({ phase: "vendors", budget: 2000, guests: 80, venueId: "venue", selectedServices: ["photography"], selectedVendorIds: ["already"], candidates: group }), /No directory listings/);
  await assert.rejects(recommend({ phase: "vendors", budget: 2000, guests: 80, venueId: "venue", categoryBudgets: { venue: 1500, florist: 700 }, candidates: group }), /No directory listings/);
});

test("an unchosen category budget does not reduce spend until that category joins the group", async () => {
  const listings = [item("venue", "venue", 1000, 100), item("catering", "catering", 1800, 100), item("florist", "florist", 200, 100)];
  const request: RecommendationInput = { phase: "vendors", budget: 3000, guests: 80, venueId: "venue", categoryBudgets: { venue: 1000, photography: 1000 }, candidates: listings };
  const result = await recommend(request);
  assert.deepEqual(result.ids, ["catering", "florist"]);
  await recommend(request, async ({ availableBudget, candidates: pool }) => {
    assert.equal(availableBudget, 2000);
    assert.deepEqual(pool.map(candidate => candidate.id), ["florist", "catering"]);
    return { ids: ["florist"] };
  });
  await recommend({ ...request, selectedServices: ["photography"] }, async ({ availableBudget, candidates: pool }) => {
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

test("entered estimates replace starting prices in vendor budget decisions", async () => {
  const listings = [item("venue", "venue", 1000, 100), item("florist", "florist", 200, 100)];
  const base: RecommendationInput = { phase: "vendors", budget: 1500, guests: 80, venueId: "venue", candidates: listings };
  assert.deepEqual((await recommend(base)).ids, ["florist"]);
  await assert.rejects(recommend({ ...base, vendorEstimates: { venue: 1400, florist: 300 } }), /No directory listings/);
  assert.deepEqual((await recommend({ ...base, vendorEstimates: { venue: 1100, florist: 300 } })).ids, ["florist"]);
});
