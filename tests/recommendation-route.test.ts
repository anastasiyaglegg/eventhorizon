import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/recommendations/route";

test("a selected vendor absent from the loaded directory gets a useful 422", async () => {
  const request = new Request("http://localhost/api/recommendations", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phase: "vendors", budget: 3000, guests: 80, venueId: "venue",
      selectedServices: ["catering"], selectedVendorIds: ["missing-caterer"],
      candidates: [
        { id: "venue", service: "venue", priceMin: 1000, capacityMin: null, capacityMax: 100, rating: null, isSynthetic: true },
        { id: "florist", service: "florist", priceMin: 200, capacityMin: null, capacityMax: 100, rating: null, isSynthetic: true },
      ],
    }),
  });
  const response = await POST(request);
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "One of your selected vendors isn't in the loaded directory. Remove it or reload." });
});
