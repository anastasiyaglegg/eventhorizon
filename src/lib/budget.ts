import type { EventPlanData } from "./plan-contract";
import type { Vendor } from "./vendor-search";

type BudgetPlan = Pick<EventPlanData, "selections" | "vendorEstimates" | "categoryBudgets" | "budgetLimit">;
type PriceSource = Pick<Vendor, "id" | "priceMin">;
const amountCents = (value: string | undefined) => value && /^\d{1,9}(?:\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : null;

/** User estimates take precedence. Otherwise a listed starting price is a planning floor, never a quote. */
export function budgetSummary(plan: BudgetPlan, vendors: PriceSource[] = []) {
  const ids = [...new Set(Object.values(plan.selections).filter((id): id is string => !!id))];
  const price = (id: string) => amountCents(plan.vendorEstimates[id]) ?? (vendors.find(vendor => vendor.id === id)?.priceMin == null ? null : Math.round(vendors.find(vendor => vendor.id === id)!.priceMin! * 100));
  const known = ids.filter(id => price(id) !== null);
  const estimatedCents = known.reduce((total, id) => total + price(id)!, 0);
  const limitCents = amountCents(plan.budgetLimit);
  const assignedCents = Object.values(plan.categoryBudgets ?? {}).reduce<number>((total, amount) =>
    total + (amountCents(amount) ?? 0), 0);
  return {
    estimatedCents,
    limitCents,
    remainingCents: limitCents === null ? null : limitCents - estimatedCents,
    assignedCents,
    unassignedCents: limitCents === null ? null : limitCents - assignedCents,
    unknownCount: ids.length - known.length,
    startingPriceCount: known.filter(id => amountCents(plan.vendorEstimates[id]) === null).length,
  };
}

export type BudgetFinding = { id: string; title: string; detail: string; tone: "needs-action" | "check" };

export function buildBudgetFindings(plan: BudgetPlan, vendors: PriceSource[]): BudgetFinding[] {
  const summary = budgetSummary(plan, vendors);
  const findings: BudgetFinding[] = [];
  if (summary.limitCents === null) findings.push({ id: "budget-total", title: "Set an event budget", detail: "A total budget is needed to check whether the plan fits.", tone: "needs-action" });
  if (summary.remainingCents !== null && summary.remainingCents < 0) findings.push({ id: "budget-over", title: "Plan exceeds the event budget", detail: `Known estimates and starting prices are ${money(-summary.remainingCents)} above the total budget.`, tone: "needs-action" });
  if (summary.unassignedCents !== null && summary.unassignedCents < 0) findings.push({ id: "budget-allocated", title: "Category budgets exceed the total", detail: `You assigned ${money(-summary.unassignedCents)} more than the event budget.`, tone: "needs-action" });
  for (const [service, id] of Object.entries(plan.selections)) {
    if (!id) continue;
    const cap = amountCents(plan.categoryBudgets?.[service as keyof NonNullable<BudgetPlan["categoryBudgets"]>]);
    const estimate = amountCents(plan.vendorEstimates[id]) ?? (vendors.find(vendor => vendor.id === id)?.priceMin == null ? null : Math.round(vendors.find(vendor => vendor.id === id)!.priceMin! * 100));
    if (cap !== null && estimate !== null && estimate > cap) findings.push({ id: `category-over:${service}`, title: `${service} exceeds its category budget`, detail: `This selected listing is ${money(estimate - cap)} above the amount assigned to ${service}.`, tone: "needs-action" });
  }
  if (summary.unknownCount) findings.push({ id: "budget-unknown", title: "Some prices are still unknown", detail: `${summary.unknownCount} selected listing${summary.unknownCount === 1 ? " has" : "s have"} no entered estimate or listed starting price. The total may increase.`, tone: "check" });
  if (summary.startingPriceCount) findings.push({ id: "budget-starting", title: "Starting prices need confirmation", detail: `${summary.startingPriceCount} listed starting price${summary.startingPriceCount === 1 ? " is" : "s are"} used in this planning total. Ask the vendor for an actual quote.`, tone: "check" });
  return findings;
}

/** Give every suggested category a planning allowance; reserve 20% of the surplus as a cushion. */
export function suggestCategoryBudgets(plan: BudgetPlan, choices: { service: keyof NonNullable<BudgetPlan["categoryBudgets"]>; priceMin: number | null }[]) {
  const total = amountCents(plan.budgetLimit);
  const next = { ...plan.categoryBudgets };
  const assigned = Object.values(next).reduce<number>((sum, value) => sum + (amountCents(value) ?? 0), 0);
  const missing = [...new Map(choices.filter(choice => amountCents(next[choice.service]) === null).map(choice => [choice.service, choice])).values()];
  const floors = missing.map(choice => Math.round((choice.priceMin ?? 0) * 100));
  const floorTotal = floors.reduce((sum, value) => sum + value, 0);
  const spare = total === null ? 0 : total - assigned - floorTotal;
  const cushionPerCategory = spare > 0 && missing.length ? Math.floor(Math.floor(spare * 0.8) / missing.length) : 0;
  const suggested: Partial<Record<keyof NonNullable<BudgetPlan["categoryBudgets"]>, number>> = {};
  const unfilled: string[] = [];
  for (const [index, choice] of missing.entries()) {
    const allowance = floors[index] + cushionPerCategory;
    if (allowance > 0) suggested[choice.service] = allowance;
    if (total === null || spare < 0 || allowance <= 0) { unfilled.push(choice.service); continue; }
    next[choice.service] = (allowance / 100).toFixed(2);
  }
  return { budgets: next, suggested, unfilled };
}

export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
