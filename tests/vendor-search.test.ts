import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleVendors, searchVendors, searchVendorNames, type Vendor } from "../src/lib/vendor-search";

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

test("ordinary place words and near-me requests do not trigger a borough prompt", () => {
  for (const query of ["catering for a party in December", "photographer in a hurry", "find catering near me"]) {
    const result = searchVendors(query, {});
    assert.doesNotMatch(result.message, /Choose one borough/);
  }
});

test("search accepts all five boroughs and normalizes imported category casing", () => {
  const bronxVendor = { ...realVendor, id: "bronx-1", service: "Catering", borough: "Bronx" };
  const result = searchVendors("catering in the Bronx", {}, [bronxVendor]);
  assert.equal(result.matches[0].id, bronxVendor.id);
});

test("vendors with missing price or capacity remain visible as possible matches", () => {
  const incomplete = { ...realVendor, priceMin: null, priceMax: null, capacityMin: null, capacityMax: null };
  const result = searchVendors("bakery in Brooklyn for 80 guests under $600", {}, [incomplete]);
  assert.equal(result.matches.length, 0);
  assert.equal(result.possibleMatches[0].id, incomplete.id);
});

test("recognizes added vendor categories and normalizes directory values", () => {
  for (const [query, service] of [["flowers in Brooklyn", "florist"], ["event decorators in Brooklyn", "decorator"], ["DJ in Brooklyn", "entertainment"]] as const) {
    const vendor = { ...sampleVendors[0], service: service === "florist" ? "Florists" : service === "decorator" ? "Decor" : "DJ", borough: "Brooklyn" };
    const result = searchVendors(query, {}, [vendor]);
    assert.equal(result.criteria.service, service);
    assert.equal(result.matches.length + result.possibleMatches.length, 1);
  }
});

test("vendor name lookup is case-insensitive, partial, and independent of prior filters", () => {
  const directory = [{ ...sampleVendors[0], name: "Buds of Brooklyn" }, { ...sampleVendors[0], id: "other", name: "Other Vendor" }];
  assert.deepEqual(searchVendorNames("  bUdS  ", directory).map(v => v.name), ["Buds of Brooklyn"]);
  assert.deepEqual(searchVendorNames("not a business", directory), []);
  assert.deepEqual(searchVendorNames("b", directory), []);
});
