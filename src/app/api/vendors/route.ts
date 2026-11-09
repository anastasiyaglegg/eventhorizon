import { z } from "zod";
import type { Vendor } from "../../../lib/vendor-search";

const vendorRow = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  category: z.string().min(1),
  borough: z.string().min(1).nullable(),
  description: z.string().nullable(),
  contact_email: z.string().email().nullable(),
  price_min: z.number().nonnegative().nullable(),
  price_max: z.number().nonnegative().nullable(),
  capacity_min: z.number().int().positive().nullable(),
  capacity_max: z.number().int().positive().nullable(),
  rating: z.number().min(0).max(5).nullable(),
  review_count: z.number().int().nonnegative(),
  review_summary: z.string().nullable(),
  source_url: z.string().url().nullable(),
  is_synthetic: z.boolean(),
});

const vendorRows = z.array(vendorRow);

function toVendor(row: z.infer<typeof vendorRow>): Vendor {
  return {
    id: row.id,
    name: row.name,
    service: row.category,
    borough: row.borough ?? "Unknown",
    capacityMin: row.capacity_min,
    capacityMax: row.capacity_max,
    priceMin: row.price_min,
    priceMax: row.price_max,
    details: row.description ?? "No description available yet.",
    contactEmail: row.contact_email,
    rating: row.rating,
    review: row.review_summary,
    reviewCount: row.review_count,
    isSynthetic: row.is_synthetic,
    sourceUrl: row.source_url,
  };
}

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return Response.json({ source: "sample", vendors: [] });
  }

  let url: URL;
  try {
    url = new URL("/rest/v1/vendors", supabaseUrl);
  } catch {
    return Response.json({ error: "Supabase URL is invalid." }, { status: 500 });
  }
  url.searchParams.set("select", "id,name,category,borough,description,contact_email,price_min,price_max,capacity_min,capacity_max,rating,review_count,review_summary,source_url,is_synthetic");
  url.searchParams.set("order", "name.asc");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
      next: { revalidate: 60 },
    });
  } catch {
    return Response.json({ error: "Could not reach the Supabase vendor directory." }, { status: 502 });
  }

  if (!response.ok) {
    return Response.json({ error: "Supabase could not return vendor records." }, { status: 502 });
  }

  const parsed = vendorRows.safeParse(await response.json());
  if (!parsed.success) {
    return Response.json({ error: "Supabase returned vendor records in an unexpected format." }, { status: 502 });
  }

  return Response.json({ source: "supabase", vendors: parsed.data.map(toVendor) });
}
