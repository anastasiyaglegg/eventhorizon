import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleVendors, searchVendors, type Vendor } from "../src/lib/vendor-search";

const realVendor: Vendor = {
  id: "f7d6d6e4-1e9d-4b63-8e55-0321eab8e94b",
  name: "Verified Brooklyn Bakery",
  service: "bakery",
  borough: "Brooklyn",
  capacityMin: null,
  capacityMax: 90,
  priceMin: 500,
  priceMax: 500,
  details: "Sourced listing.",
  contactEmail: null,
  rating: null,
  review: null,
  reviewCount: 0,
  isSynthetic: false,
  sourceUrl: "https://example.com/vendor",
};

test("sample directory is explicitly marked synthetic", () => {
  assert.ok(sampleVendors.length > 0);
  assert.ok(sampleVendors.every(vendor => vendor.isSynthetic));
});

test("vendor search filters the supplied directory rather than a fixed JSON list", () => {
  const result = searchVendors("bakery in Brooklyn for 80 guests under $600", {}, [realVendor]);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].id, realVendor.id);
  assert.equal(result.matches[0].isSynthetic, false);
});

test("vendor search excludes records above the requested budget or capacity", () => {
  const result = searchVendors("bakery in Brooklyn for 100 guests under $400", {}, [realVendor]);
  assert.equal(result.matches.length, 0);
});
