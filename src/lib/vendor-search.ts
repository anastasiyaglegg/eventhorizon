import directory from "../data/vendors.json";

const services = [
  { name: "bakery", pattern: /\b(?:bread|bakery|bakeries|baker|dinner rolls?|sourdough|focaccia)\b/i },
  { name: "catering", pattern: /\b(?:caterer(?:s)?|catering|food)\b/i },
  { name: "venue", pattern: /\b(?:venue(?:s)?|event space)\b/i },
  { name: "AV", pattern: /\b(?:av|audio[ -]?visual|sound|lighting)\b/i },
  { name: "photography", pattern: /\b(?:photo(?:graphy|grapher)?s?)\b/i },
];
const boroughs = ["Brooklyn", "Manhattan", "Queens"];
const dollars = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});

export type Vendor = (typeof directory)[number];
export type VendorCriteria = { service?: string; borough?: string; guests?: number; budget?: number };

export function describeCriteria(criteria: VendorCriteria) {
  return [
    criteria.service, criteria.borough,
    criteria.guests === undefined ? undefined : `${criteria.guests} guests`,
    criteria.budget === undefined ? undefined : `up to ${dollars.format(criteria.budget)}`,
  ].filter(Boolean).join(" · ");
}

export function searchVendors(query: string, previous: VendorCriteria) {
  const next = { ...previous };
  const service = services.find(({ pattern }) => pattern.test(query));
  const places = boroughs.filter(borough => new RegExp(`\\b${borough}\\b`, "i").test(query));
  const guestCount = query.match(/\b([\d,]+)\s*(?:guests?|people|attendees?)\b/i);
  const budget = query.match(/(?:\$\s*|\bbudget(?:\s+(?:of|is))?\s+)([\d,]+(?:\.\d+)?)\s*(k\b)?/i);
  if (places.length > 1 || (places.length === 0 && /\b(?:in|near)\s+[a-z]/i.test(query))) {
    return { criteria: previous, message: "Choose one borough from the sample directory: Brooklyn, Manhattan, or Queens.", matches: [] };
  }
  if (!service && !places.length && !guestCount && !budget) {
    return { criteria: previous, message: "Try a service, borough, guest count, or dollar budget, such as “catering in Brooklyn for 80 guests under $3,000.”", matches: [] };
  }
  if (service) next.service = service.name;
  if (places[0]) next.borough = places[0];
  if (guestCount) next.guests = Number(guestCount[1].replaceAll(",", ""));
  if (budget) next.budget = Number(budget[1].replaceAll(",", "")) * (budget[2] ? 1000 : 1);
  if (!next.service) {
    return { criteria: next, message: "What service do you need: catering, a bakery, a venue, AV, or photography?", matches: [] };
  }

  const matches = directory.filter(vendor =>
    vendor.service === next.service &&
    (next.borough === undefined || vendor.borough === next.borough) &&
    (next.guests === undefined || (vendor.capacity !== null && vendor.capacity >= next.guests)) &&
    (next.budget === undefined || (vendor.samplePrice !== null && vendor.samplePrice <= next.budget)),
  ).sort((a, b) => (a.samplePrice ?? Infinity) - (b.samplePrice ?? Infinity)).slice(0, 3);

  return {
    criteria: next,
    message: matches.length ? `Sample matches for ${describeCriteria(next)}.`
      : `No confirmed sample matches for ${describeCriteria(next)}. Try a different borough or budget, or start a new search.`,
    matches,
  };
}

export function samplePrice(vendor: Vendor) {
  return vendor.samplePrice === null ? "Unknown" : dollars.format(vendor.samplePrice);
}
