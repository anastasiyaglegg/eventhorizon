import type { EventPlanData } from "./plan-contract";

export function budgetSummary(plan: Pick<EventPlanData, "selections" | "vendorEstimates" | "budgetLimit">) {
  const ids = [...new Set(Object.values(plan.selections).filter((id): id is string => !!id))];
  const known = ids.filter(id => plan.vendorEstimates[id] && /^\d{1,8}(?:\.\d{1,2})?$/.test(plan.vendorEstimates[id]));
  const estimatedCents = known.reduce((total, id) => total + Math.round(Number(plan.vendorEstimates[id]) * 100), 0);
  const limitCents = plan.budgetLimit && /^\d{1,9}(?:\.\d{1,2})?$/.test(plan.budgetLimit)
    ? Math.round(Number(plan.budgetLimit) * 100) : null;
  return {
    estimatedCents,
    limitCents,
    remainingCents: limitCents === null ? null : limitCents - estimatedCents,
    unknownCount: ids.length - known.length,
  };
}

export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
