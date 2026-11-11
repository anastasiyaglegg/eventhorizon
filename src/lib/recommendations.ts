import { z } from "zod";

const service = z.enum(["venue", "catering", "florist", "entertainment", "bakery", "av", "photography", "decorator"]);
const candidate = z.object({
  id: z.string().min(1).max(80),
  service,
  borough: z.string().max(80).optional(),
  priceMin: z.number().nonnegative().nullable(),
  capacityMin: z.number().int().positive().nullable(),
  capacityMax: z.number().int().positive().nullable(),
  rating: z.number().min(0).max(5).nullable(),
  isSynthetic: z.boolean(),
}).strict();

export const recommendationInputSchema = z.object({
  phase: z.enum(["venue", "vendors"]),
  budget: z.number().positive().max(100_000_000),
  guests: z.number().int().positive().max(100_000),
  venueId: z.string().max(80).optional(),
  selectedServices: z.array(service.exclude(["venue"])).max(7).optional(),
  selectedVendorIds: z.array(z.string().min(1).max(80)).max(7).optional(),
  categoryBudgets: z.partialRecord(service, z.number().nonnegative()).optional(),
  candidates: z.array(candidate).max(120),
}).strict();

export const recommendationChoiceSchema = z.object({ ids: z.array(z.string().min(1).max(80)).min(1).max(7) }).strict();

export const recommendationResponseSchema = z.object({
  version: z.literal("recommendations.v1"),
  phase: z.enum(["venue", "vendors"]),
  source: z.enum(["ai", "directory"]),
  run_id: z.string().uuid(),
  snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/),
  ids: z.array(z.string().min(1).max(80)).min(1).max(7),
  note: z.string().max(240),
}).strict();

export type RecommendationInput = z.infer<typeof recommendationInputSchema>;
export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>;
export type RecommendationCandidate = z.infer<typeof candidate>;
export type RecommendationRanker = (input: { phase: RecommendationInput["phase"]; budget: number; availableBudget: number; guests: number; venueBorough?: string; candidates: RecommendationCandidate[] }, signal?: AbortSignal) => Promise<unknown>;

function fit(candidate: RecommendationCandidate, guests: number, budget: number) {
  return (candidate.capacityMin === null || candidate.capacityMin <= guests)
    && (candidate.capacityMax === null || candidate.capacityMax >= guests)
    && (candidate.priceMin === null || cents(candidate.priceMin) <= cents(budget));
}

export const cents = (amount: number) => Math.round(amount * 100);

/** A category's reservation and its known selected price are one commitment, whichever is larger. */
export function committedCents(input: RecommendationInput, choiceIds: string[] = []) {
  const byService = new Map<string, number>(Object.entries(input.categoryBudgets ?? {}).map(([service, amount]) => [service, cents(amount ?? 0)]));
  for (const id of [input.venueId, ...(input.selectedVendorIds ?? []), ...choiceIds]) {
    if (!id) continue;
    const listing = input.candidates.find(item => item.id === id);
    if (!listing) throw new Error("A selected listing is missing from the directory snapshot.");
    byService.set(listing.service, Math.max(byService.get(listing.service) ?? 0, cents(listing.priceMin ?? 0)));
  }
  return [...byService.values()].reduce((total, value) => total + value, 0);
}

function rankByKnownFacts(a: RecommendationCandidate, b: RecommendationCandidate) {
  const unknowns = Number(a.priceMin === null) + Number(a.capacityMax === null) - Number(b.priceMin === null) - Number(b.capacityMax === null);
  if (unknowns) return unknowns;
  return (b.rating ?? 0) - (a.rating ?? 0) || (a.priceMin ?? Infinity) - (b.priceMin ?? Infinity) || a.id.localeCompare(b.id);
}

export function recommendationPool(input: RecommendationInput) {
  const allocated = Object.values(input.categoryBudgets ?? {}).reduce<number>((sum, amount) => sum + cents(amount ?? 0), 0);
  if (allocated > cents(input.budget)) throw new Error("Assigned vendor budgets exceed the total event budget.");
  const venue = input.venueId ? input.candidates.find(item => item.id === input.venueId && item.service === "venue") : undefined;
  if (input.phase === "vendors" && !venue) throw new Error("Choose a venue before requesting vendor suggestions.");
  if (input.phase === "vendors" && venue && !fit(venue, input.guests, input.budget)) throw new Error("The chosen venue does not fit the guest count or budget. Choose another venue or update your event details.");
  if (venue && input.categoryBudgets?.venue !== undefined && venue.priceMin !== null && cents(venue.priceMin) > cents(input.categoryBudgets.venue)) throw new Error("The chosen venue costs more than its assigned budget.");
  const remaining = cents(input.budget) - committedCents(input);
  if (input.phase === "vendors" && remaining < 0) throw new Error("The chosen venue, vendors, and assigned budgets already exceed the event budget.");
  const eligible = input.candidates.filter(item => (input.phase === "venue" ? item.service === "venue" : item.service !== "venue")
    && (input.phase === "venue" || !input.selectedServices?.includes(item.service as Exclude<typeof item.service, "venue">))
    && fit(item, input.guests, input.budget)
    && (input.categoryBudgets?.[item.service] === undefined || item.priceMin === null || cents(item.priceMin) <= cents(input.categoryBudgets[item.service]!))
    && committedCents(input, [item.id]) <= cents(input.budget));
  if (input.phase === "venue") return eligible.sort(rankByKnownFacts).slice(0, 15);
  const perService = new Map<string, number>();
  return eligible.sort((a, b) => {
    if (venue?.borough && venue.borough !== "Unknown") {
      const nearA = a.borough === venue.borough ? 0 : 1;
      const nearB = b.borough === venue.borough ? 0 : 1;
      if (nearA !== nearB) return nearA - nearB;
    }
    return rankByKnownFacts(a, b);
  }).filter(item => {
    const count = perService.get(item.service) ?? 0;
    if (count >= 5) return false;
    perService.set(item.service, count + 1);
    return true;
  });
}
