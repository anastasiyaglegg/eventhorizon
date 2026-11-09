import directory from "../data/vendors.json";

const services = [
  { name: "bakery", pattern: /\b(?:bread|bakery|bakeries|baker|dinner rolls?|sourdough|focaccia)\b/i },
  { name: "catering", pattern: /\b(?:caterer(?:s)?|catering|food)\b/i },
  { name: "venue", pattern: /\b(?:venue(?:s)?|event space)\b/i },
  { name: "AV", pattern: /\b(?:av|audio[ -]?visual|sound|lighting)\b/i },
  { name: "photography", pattern: /\b(?:photo(?:graphy|grapher)?s?)\b/i },
];
const boroughs = ["Brooklyn", "Manhattan", "Queens", "Bronx", "Staten Island"];
const dollars = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});

export type Vendor = {
  id: string;
  name: string;
  service: string;
  borough: string;
  capacityMin: number | null;
  capacityMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  details: string;
  contactEmail: string | null;
  rating: number | null;
  review: string | null;
  reviewCount: number | null;
  isSynthetic: boolean;
  sourceUrl: string | null;
};
export type VendorCriteria = { service?: string; borough?: string; guests?: number; budget?: number };
export type VendorSearchResult = {
  criteria: VendorCriteria;
  message: string;
  matches: Vendor[];
  possibleMatches: Vendor[];
};

export function normalizeVendorService(service: string) {
  const normalized = service.trim().toLocaleLowerCase("en-US");
  if (["caterer", "caterers", "food"].includes(normalized)) return "catering";
  if (["baker", "bakers", "bakeries"].includes(normalized)) return "bakery";
  if (["audio visual", "audio-visual", "sound", "lighting"].includes(normalized)) return "av";
  if (["photo", "photographer", "photographers", "photo services"].includes(normalized)) return "photography";
  return normalized;
}

export const sampleVendors: Vendor[] = directory.map((vendor) => ({
  id: vendor.id,
  name: vendor.name,
  service: normalizeVendorService(vendor.service),
  borough: vendor.borough,
  capacityMin: null,
  capacityMax: vendor.capacity,
  priceMin: vendor.samplePrice,
  priceMax: vendor.samplePrice,
  details: vendor.details,
  contactEmail: vendor.contactEmail,
  rating: vendor.rating,
  review: vendor.review,
  reviewCount: null,
  isSynthetic: true,
  sourceUrl: null,
}));

export function describeCriteria(criteria: VendorCriteria) {
  return [
    criteria.service, criteria.borough,
    criteria.guests === undefined ? undefined : `${criteria.guests} guests`,
    criteria.budget === undefined ? undefined : `up to ${dollars.format(criteria.budget)}`,
  ].filter(Boolean).join(" · ");
}

export function searchVendors(query: string, previous: VendorCriteria, vendors: Vendor[] = sampleVendors) {
  const next = { ...previous };
  const service = services.find(({ pattern }) => pattern.test(query));
  const places = boroughs.filter(borough => new RegExp(`\\b${borough.replace(" ", "\\s+")}\\b`, "i").test(query));
  const guestCount = query.match(/\b([\d,]+)\s*(?:guests?|people|attendees?)\b/i);
  const budget = query.match(/(?:\$\s*|\bbudget(?:\s+(?:of|is))?\s+)([\d,]+(?:\.\d+)?)\s*(k\b)?/i);
  if (places.length > 1) {
    return { criteria: previous, message: `Choose one borough: ${boroughs.join(", ")}.`, matches: [], possibleMatches: [] };
  }
  if (!service && !places.length && !guestCount && !budget) {
    return { criteria: previous, message: "Try a service, borough, guest count, or dollar budget, such as “catering in Brooklyn for 80 guests under $3,000.”", matches: [], possibleMatches: [] };
  }
  if (service) next.service = normalizeVendorService(service.name);
  if (places[0]) next.borough = places[0];
  if (guestCount) next.guests = Number(guestCount[1].replaceAll(",", ""));
  if (budget) next.budget = Number(budget[1].replaceAll(",", "")) * (budget[2] ? 1000 : 1);
  if (!next.service) {
    return { criteria: next, message: "What service do you need: catering, a bakery, a venue, AV, or photography?", matches: [], possibleMatches: [] };
  }

  const classified = vendors.flatMap((vendor) => {
    if (normalizeVendorService(vendor.service) !== next.service) return [];
    let uncertain = false;
    if (next.borough !== undefined && vendor.borough !== next.borough) {
      if (vendor.borough === "Unknown") uncertain = true;
      else return [];
    }
    if (next.guests !== undefined) {
      if (vendor.capacityMax === null) uncertain = true;
      else if (vendor.capacityMax < next.guests || (vendor.capacityMin !== null && vendor.capacityMin > next.guests)) return [];
    }
    if (next.budget !== undefined) {
      if (vendor.priceMin === null) uncertain = true;
      else if (vendor.priceMin > next.budget) return [];
    }
    return [{ vendor, uncertain }];
  }).sort((a, b) => (a.vendor.priceMin ?? Infinity) - (b.vendor.priceMin ?? Infinity));
  const matches = classified.filter(item => !item.uncertain).slice(0, 3).map(item => item.vendor);
  const possibleMatches = classified.filter(item => item.uncertain).slice(0, 3).map(item => item.vendor);

  return {
    criteria: next,
    message: matches.length || possibleMatches.length ? `Matches for ${describeCriteria(next)}. Listings with missing details are shown as possible matches.`
      : `No matches for ${describeCriteria(next)}. Try a different borough or budget, or start a new search.`,
    matches,
    possibleMatches,
  };
}

export function samplePrice(vendor: Vendor) {
  if (vendor.priceMin === null && vendor.priceMax === null) return "Unknown";
  if (vendor.priceMin === null) return `Up to ${dollars.format(vendor.priceMax!)}`;
  if (vendor.priceMax === null) return `From ${dollars.format(vendor.priceMin)}`;
  if (vendor.priceMin === vendor.priceMax) return dollars.format(vendor.priceMin);
  return `${dollars.format(vendor.priceMin)}–${dollars.format(vendor.priceMax)}`;
}

export function capacityLabel(vendor: Vendor) {
  if (vendor.capacityMin === null && vendor.capacityMax === null) return "Unknown";
  if (vendor.capacityMin === null) return `Up to ${vendor.capacityMax}`;
  if (vendor.capacityMax === null) return `From ${vendor.capacityMin}`;
  if (vendor.capacityMin === vendor.capacityMax) return `${vendor.capacityMin}`;
  return `${vendor.capacityMin}–${vendor.capacityMax}`;
}
