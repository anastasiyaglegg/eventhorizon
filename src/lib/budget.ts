import type { EventPlanData } from "./plan-contract";
import type { Vendor } from "./vendor-search";
import { serviceLabels } from "./services";

type BudgetPlan = Pick<EventPlanData, "selections" | "vendorEstimates" | "categoryBudgets" | "budgetLimit">;
type PriceSource = Pick<Vendor, "id" | "priceMin">;
type Service = keyof typeof serviceLabels;
export const amountCents = (value: string | undefined) => value && /^\d{1,9}(?:\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : null;

/** A new listing starts with its listed price; replacing a listing must not inherit the old plan amount. */
export function budgetAfterVendorChoice(current: string | undefined, previousId: string | undefined, nextId: string, listedPrice: number | null) {
  if (previousId && previousId !== nextId) return listedPrice === null ? "" : listedPrice.toFixed(2);
  if (amountCents(current) === null && listedPrice !== null) return listedPrice.toFixed(2);
  return current;
}

/** Keep old saved amounts when moving from separate estimates to one budget per category. */
export function migrateLegacyBudgets<T extends BudgetPlan>(plan: T): T {
  if (!Object.keys(plan.vendorEstimates).length) return plan;
  const categoryBudgets = { ...plan.categoryBudgets };
  for (const [service, id] of Object.entries(plan.selections)) {
    if (!id || amountCents(categoryBudgets[service as Service]) !== null) continue;
    const oldAmount = amountCents(plan.vendorEstimates[id]);
    if (oldAmount !== null) categoryBudgets[service as Service] = (oldAmount / 100).toFixed(2);
  }
  return { ...plan, categoryBudgets, vendorEstimates: {} };
}

/** A category budget is the planned amount to spend; listed prices never enter this total. */
export function budgetSummary(plan: BudgetPlan) {
  const plannedCents = Object.entries(plan.selections).reduce((total, [service, id]) =>
    total + (id ? amountCents(plan.categoryBudgets?.[service as Service]) ?? 0 : 0), 0);
  const limitCents = amountCents(plan.budgetLimit);
  const unbudgetedCount = Object.entries(plan.selections).filter(([service, id]) => !!id && amountCents(plan.categoryBudgets?.[service as Service]) === null).length;
  return {
    plannedCents,
    limitCents,
    remainingCents: limitCents === null ? null : limitCents - plannedCents,
    unbudgetedCount,
  };
}

export type BudgetFinding = { id: string; title: string; detail: string; tone: "needs-action" | "check" };

export function buildBudgetFindings(plan: BudgetPlan, vendors: PriceSource[]): BudgetFinding[] {
  const summary = budgetSummary(plan);
  const findings: BudgetFinding[] = [];
  if (summary.limitCents === null) findings.push({ id: "budget-total", title: "Set an event budget", detail: "A total budget is needed to check whether the plan fits.", tone: "needs-action" });
  if (summary.remainingCents !== null && summary.remainingCents < 0) findings.push({ id: "budget-over", title: "Plan exceeds the event budget", detail: `Planned category spending is ${money(-summary.remainingCents)} above the total budget.`, tone: "needs-action" });
  for (const [service, id] of Object.entries(plan.selections)) {
    if (!id) continue;
    const budget = amountCents(plan.categoryBudgets?.[service as Service]);
    const label = serviceLabels[service as Service];
    if (budget === null) {
      findings.push({ id: `category-missing:${service}`, title: `Set a budget for ${label}`, detail: `${label} is selected but has no planned spending amount. Add one to complete the total.`, tone: "check" });
      continue;
    }
    const listedPrice = vendors.find(vendor => vendor.id === id)?.priceMin;
    if (listedPrice !== null && listedPrice !== undefined && Math.round(listedPrice * 100) > budget) {
      findings.push({ id: `category-below-list:${service}`, title: `${label} may cost more than planned`, detail: `The listing starts at ${money(Math.round(listedPrice * 100))}, above your ${money(budget)} budget. Confirm the price or adjust the budget.`, tone: "check" });
    }
  }
  return findings;
}

/** Give every suggested category a planning allowance; reserve 20% of the surplus as a cushion. */
export function suggestCategoryBudgets(plan: BudgetPlan, choices: { service: Service; priceMin: number | null }[]) {
  const total = amountCents(plan.budgetLimit);
  const next = { ...plan.categoryBudgets };
  const activeServices = new Set<Service>([
    ...Object.entries(plan.selections).filter(([, id]) => !!id).map(([service]) => service as Service),
    ...choices.map(choice => choice.service),
  ]);
  const assigned = [...activeServices].reduce((sum, service) => sum + (amountCents(next[service]) ?? 0), 0);
  const missing = [...new Map(choices.filter(choice => amountCents(next[choice.service]) === null).map(choice => [choice.service, choice])).values()];
  const floors = missing.map(choice => Math.round((choice.priceMin ?? 0) * 100));
  const floorTotal = floors.reduce((sum, value) => sum + value, 0);
  const spare = total === null ? 0 : total - assigned - floorTotal;
  const cushionPerCategory = spare > 0 && missing.length ? Math.floor(Math.floor(spare * 0.8) / missing.length) : 0;
  const suggested: Partial<Record<Service, number>> = {};
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
