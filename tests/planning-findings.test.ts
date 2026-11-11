import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlanningFindings, selectedPlanRows, vendorResultAction } from "../src/lib/planning-findings";
import type { EventPlan } from "../src/client/event-plan";
import { sampleVendors } from "../src/lib/vendor-search";

const provider = sampleVendors.find(item => item.service === "av")!;
const plan = (): EventPlan => ({
  name: "Gala", themeId: "", eventDate: "2026-11-20", eventStart: "18:00", eventEnd: "20:00", eventGuests: "80",
  selections: { venue: "venue-one", av: provider.id }, vendorSlots: {
    "venue-one": { date: "2026-11-20", start: "08:00", end: "23:00" },
    [provider.id]: { date: "2026-11-20", start: "17:00", end: "21:00" },
  }, otherEvents: [], vendorStatuses: {}, vendorEstimates: {}, budgetLimit: "",
});

test("an invalid calendar date is an explicit finding and blocks AI review", () => {
  const draft = plan(); draft.eventDate = "2026-02-30";
  const result = buildPlanningFindings(draft, sampleVendors);
  assert.equal(result.scheduleReady, false);
  assert.equal(result.findings.some(item => item.id === "event-time"), true);
});

test("a venue is required while every other vendor category remains optional", () => {
  const draft = plan();
  draft.selections = {};
  draft.vendorSlots = {};
  const withoutVenue = buildPlanningFindings(draft, sampleVendors);
  assert.ok(withoutVenue.findings.some(item => item.id === "venue" && item.tone === "needs-action"));

  draft.selections = { venue: "venue-one" };
  draft.vendorSlots = { "venue-one": { date: "2026-11-20", start: "08:00", end: "23:00" } };
  const venueOnly = buildPlanningFindings(draft, sampleVendors);
  assert.equal(venueOnly.findings.some(item => item.id === "venue"), false);
  assert.equal(venueOnly.findings.some(item => item.id.startsWith("missing-slot:")), false);
});

test("a missing main date does not hide each vendor's missing schedule", () => {
  const draft = plan(); draft.eventDate = ""; draft.vendorSlots = {};
  const result = buildPlanningFindings(draft, sampleVendors);
  assert.equal(result.scheduleReady, false);
  assert.ok(result.findings.some(item => item.id === "event-time"));
  assert.ok(result.findings.some(item => item.id === `missing-slot:${provider.id}`));
  assert.ok(result.findings.some(item => item.id === "venue-hours"));
});

test("other events report their overlap with a planned vendor", () => {
  const draft = plan(); draft.otherEvents = [{ id: "staff", name: "Staff briefing", slot: { date: "2026-11-20", start: "17:30", end: "18:30" } }];
  const result = buildPlanningFindings(draft, sampleVendors);
  assert.equal(result.findings.some(item => item.id === "other-event-vendors:staff" && item.detail.includes(provider.name) && item.tone === "needs-action"), true);
});
test("events using the one room cannot overlap each other", () => {
  const draft = plan(); draft.otherEvents = [
    { id: "staff", name: "Staff briefing", slot: { date: "2026-11-20", start: "17:30", end: "18:30" } },
    { id: "photos", name: "Photo shoot", slot: { date: "2026-11-20", start: "17:45", end: "18:15" } },
  ];
  const result = buildPlanningFindings(draft, sampleVendors);
  assert.equal(result.findings.some(item => item.id === "event-overlap" && item.tone === "needs-action"), true);
  assert.equal(result.findings.filter(item => item.id.startsWith("other-event-overlap:")).length, 1);
});

test("a selected vendor missing from the loaded directory is still checked and is flagged", () => {
  const draft = plan(); const missingId = "11111111-1111-1111-1111-111111111111";
  draft.selections = { venue: "venue-one", catering: missingId };
  draft.vendorSlots = { "venue-one": { date: "2026-11-20", start: "08:00", end: "23:00" }, [missingId]: { date: "2026-11-20", start: "17:30", end: "20:30" } };
  const result = buildPlanningFindings(draft, sampleVendors);
  assert.equal(result.selected.length, 1);
  assert.equal(result.scheduleReady, true);
  assert.equal(result.findings.some(item => item.id === "vendors-not-loaded"), true);
  assert.equal(result.findings.some(item => item.id === `${missingId}:catering_arrival`), true);
  assert.equal(result.findings.some(item => item.id === `${missingId}:catering_finish`), true);
});

test("missing selected vendors remain in the editable plan and replacement list", () => {
  const draft = plan(); draft.selections = { venue: "missing-venue", catering: "missing-caterer" };
  const rows = selectedPlanRows(draft, sampleVendors);
  assert.deepEqual(rows.map(row => [row.service, row.id, row.name, row.vendor]), [
    ["venue", "missing-venue", "Selected venue (details not loaded)", undefined],
    ["catering", "missing-caterer", "Selected caterer (details not loaded)", undefined],
  ]);
});

test("a search result already selected says so rather than offering to replace itself", () => {
  const chosen = sampleVendors.find(vendor => vendor.service === "catering")!;
  assert.deepEqual(vendorResultAction(chosen, { catering: chosen.id }), { label: "Already in your plan", disabled: true });
  assert.match(vendorResultAction({ ...chosen, id: "another" }, { catering: chosen.id }).label, /^Replace planned caterer/);
  assert.deepEqual(vendorResultAction(chosen, { catering: undefined }), { label: `Add ${chosen.name} to plan`, disabled: false });
});
