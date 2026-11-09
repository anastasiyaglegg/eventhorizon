import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/vendors/route";

test("vendor API reports sample mode when Supabase is not configured", async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  try {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { source: "sample", vendors: [] });
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});

test("vendor API validates and maps Supabase rows", async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const oldFetch = globalThis.fetch;
  process.env.SUPABASE_URL = "https://project.example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
  let requested = "";
  globalThis.fetch = async (input, init) => {
    requested = String(input);
    assert.equal(new Headers(init?.headers).get("apikey"), "publishable-test-key");
    return Response.json([{
      id: "f7d6d6e4-1e9d-4b63-8e55-0321eab8e94b",
      name: "Real Bakery", category: "bakery", borough: "Brooklyn",
      description: null, contact_email: null, price_min: null, price_max: null,
      capacity_min: null, capacity_max: null,
      rating: null, review_count: 0, review_summary: null, source_url: null,
      is_synthetic: false,
    }]);
  };
  try {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.match(requested, /\/rest\/v1\/vendors/);
    assert.match(requested, /select=/);
    assert.deepEqual(await response.json(), {
      source: "supabase",
      vendors: [{
        id: "f7d6d6e4-1e9d-4b63-8e55-0321eab8e94b",
        name: "Real Bakery", service: "bakery", borough: "Brooklyn",
        capacityMin: null, capacityMax: null, priceMin: null, priceMax: null,
        details: "No description available yet.",
        contactEmail: null, rating: null, review: null, reviewCount: 0,
        isSynthetic: false, sourceUrl: null,
      }],
    });
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});

test("vendor API skips bad records and accepts blank emails and database UUID literals", async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const oldFetch = globalThis.fetch;
  process.env.SUPABASE_URL = "https://project.example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
  globalThis.fetch = async () => Response.json([
    {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Imported bakery", category: "Bakery", borough: "Brooklyn",
      description: null, contact_email: "", price_min: null, price_max: null,
      capacity_min: null, capacity_max: null, rating: null, review_count: 0,
      review_summary: null, source_url: "https://example.com/vendor", is_synthetic: false,
    },
    {
      id: "bad-link", name: "Unsafe row", category: "bakery", borough: "Brooklyn",
      description: null, contact_email: "", price_min: null, price_max: null,
      capacity_min: null, capacity_max: null, rating: null, review_count: 0,
      review_summary: null, source_url: "javascript:alert(1)", is_synthetic: false,
    },
  ]);
  try {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      source: "supabase",
      vendors: [{
        id: "00000000-0000-0000-0000-000000000001",
        name: "Imported bakery", service: "bakery", borough: "Brooklyn",
        capacityMin: null, capacityMax: null, priceMin: null, priceMax: null,
        details: "No description available yet.", contactEmail: null,
        rating: null, review: null, reviewCount: 0, isSynthetic: false,
        sourceUrl: "https://example.com/vendor",
      }],
      warning: "1 vendor record was skipped because its data was invalid.",
    });
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});

test("vendor API handles a successful HTTP response with invalid JSON", async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const oldFetch = globalThis.fetch;
  process.env.SUPABASE_URL = "https://project.example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
  globalThis.fetch = async () => new Response("not json", { status: 200 });
  try {
    const response = await GET();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "Supabase returned an unreadable vendor response." });
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
