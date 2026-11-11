"use client";

import { useEffect, useState } from "react";
import { serviceLabels, useEventPlan, type Service } from "./event-plan";
import { recommendationResponseSchema, type RecommendationResponse } from "../lib/recommendations";
import { capacityLabel, samplePrice, type Vendor } from "../lib/vendor-search";
import { budgetSummary, money, suggestCategoryBudgets } from "../lib/budget";

const cache = new Map<string, RecommendationResponse>();

function compact(vendor: Vendor) {
  return {
    id: vendor.id, service: vendor.service as Service, borough: vendor.borough, priceMin: vendor.priceMin,
    capacityMin: vendor.capacityMin, capacityMax: vendor.capacityMax,
    rating: vendor.isSynthetic ? null : vendor.rating, isSynthetic: vendor.isSynthetic,
  };
}

export function RecommendationPanel() {
  const { plan, setField, vendors, directoryReady } = useEventPlan();
  const budget = Number(plan.budgetLimit);
  const guests = Number(plan.eventGuests);
  const ready = directoryReady && Number.isFinite(budget) && budget > 0 && Number.isInteger(guests) && guests > 0;
  const phase = plan.selections.venue ? "vendors" : "venue";
  const candidates = vendors.filter(vendor => Object.hasOwn(serviceLabels, vendor.service)).slice(0, 120).map(compact);
  const selectedServices = (Object.keys(serviceLabels) as Service[]).filter(service => service !== "venue" && !!plan.selections[service]);
  const selectedVendorIds = selectedServices.flatMap(service => plan.selections[service] ? [plan.selections[service]!] : []);
  const categoryBudgets = Object.fromEntries(Object.entries(plan.categoryBudgets ?? {}).filter(([, amount]) => amount && Number(amount) > 0).map(([service, amount]) => [service, Number(amount)]));
  const allCategoriesChosen = phase === "vendors" && selectedServices.length === 7;
  const request = ready && !allCategoriesChosen ? { phase, budget, guests, venueId: plan.selections.venue, selectedServices, selectedVendorIds, categoryBudgets, candidates } : null;
  const key = request ? JSON.stringify(request) : "";
  const [result, setResult] = useState<{ key: string; value: RecommendationResponse } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [loadingKey, setLoadingKey] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!key) return;
    const remembered = cache.get(key);
    if (remembered) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingKey(key);
      setError(null);
      try {
        const response = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: controller.signal });
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Suggestions are unavailable right now.");
        const parsed = recommendationResponseSchema.safeParse(body);
        if (!parsed.success) throw new Error("Suggestions could not be read.");
        cache.set(key, parsed.data);
        if (!controller.signal.aborted) setResult({ key, value: parsed.data });
      } catch (reason) {
        if (!controller.signal.aborted) setError({ key, message: reason instanceof Error ? reason.message : "Suggestions are unavailable right now." });
      } finally { if (!controller.signal.aborted) setLoadingKey(""); }
    }, 700);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, retryCount]);

  const response = cache.get(key) ?? (result?.key === key ? result.value : null);
  const recommended = response?.ids.flatMap(id => {
    const vendor = vendors.find(item => item.id === id);
    return vendor ? [vendor] : [];
  }) ?? [];
  const suggestedByService = new Map(recommended.map(vendor => [vendor.service, vendor]));
  const vendorServices = (Object.keys(serviceLabels) as Service[]).filter(service => service !== "venue");
  const venue = vendors.find(vendor => vendor.id === plan.selections.venue);
  const venueTooSmall = venue?.capacityMax !== null && venue?.capacityMax !== undefined && venue.capacityMax < guests;
  const searching = !!key && (loadingKey === key || (!response && error?.key !== key));
  const allocation = budgetSummary(plan, vendors);
  const budgetChoices = [venue, ...selectedVendorIds.map(id => vendors.find(vendor => vendor.id === id)), ...recommended]
    .filter((vendor): vendor is Vendor => !!vendor).map(vendor => ({ service: vendor.service as Service, priceMin: vendor.priceMin }));
  const suggestedBudgets = suggestCategoryBudgets(plan, budgetChoices);
  const knownStartingTotal = (venue?.priceMin ?? 0)
    + selectedVendorIds.reduce((total, id) => total + (vendors.find(vendor => vendor.id === id)?.priceMin ?? 0), 0)
    + recommended.reduce((total, vendor) => total + (vendor.priceMin ?? 0), 0);
  const unknownStartingPrices = [venue, ...selectedVendorIds.map(id => vendors.find(vendor => vendor.id === id)), ...recommended].filter(vendor => vendor && vendor.priceMin === null).length;
  function possibleOption(service: Service) {
    const categoryLimit = Number(plan.categoryBudgets?.[service] || 0);
    return vendors.filter(vendor => vendor.service === service
      && (vendor.capacityMin === null || vendor.capacityMin <= guests)
      && (vendor.capacityMax === null || vendor.capacityMax >= guests)
      && (!categoryLimit || vendor.priceMin === null || vendor.priceMin <= categoryLimit))
      .sort((a, b) => Number(b.borough === venue?.borough) - Number(a.borough === venue?.borough) || (a.priceMin ?? Infinity) - (b.priceMin ?? Infinity))[0];
  }
  function budgetField(service: Service, priceMin: number | null = null) {
    return <label className="category-budget">Budget for {serviceLabels[service]} ($)<input inputMode="decimal" placeholder="Set an amount" value={plan.categoryBudgets?.[service] ?? ""} onChange={event => {
      const value = event.target.value;
      if (/^$|^\d{1,8}(?:\.\d{0,2})?$/.test(value)) setField("categoryBudgets")(current => ({ ...current, [service]: value }));
    }} />{suggestedBudgets.suggested[service] !== undefined ? <small>Suggested planning budget: {money(suggestedBudgets.suggested[service]!)}{priceMin !== null ? ` · listed starting price ${money(Math.round(priceMin * 100))}` : " · listing price unknown"}</small> : priceMin !== null ? <small>Listed starting price: {money(Math.round(priceMin * 100))}</small> : <small>Listing price unknown; choose a planning amount.</small>}</label>;
  }

  function chooseVenue(id: string) { setField("selections")(current => ({ ...current, venue: id })); }
  function chooseGroup() {
    setField("selections")(current => {
      const next = { ...current };
      for (const vendor of recommended) {
        const service = vendor.service as Service;
        if (service !== "venue" && !next[service]) next[service] = vendor.id;
      }
      return next;
    });
    setField("categoryBudgets")(suggestedBudgets.budgets);
  }

  return <section className="recommendation-panel" aria-labelledby="recommendation-title">
    <div className="panel-header"><div><p className="eyebrow">{phase === "venue" ? "Next: choose a place" : "Next: choose your team"}</p><h3 id="recommendation-title">{phase === "venue" ? "Venues for your event" : "A vendor group to consider"}</h3></div></div>
    {!ready ? <p className="helper">{directoryReady ? "Enter your budget and guest count above to see suggestions." : "Loading vendor choices…"}</p>
      : <>
        {venueTooSmall && <div className="alert" role="alert"><p>Your selected venue lists room for {venue?.capacityMax} guests, fewer than the {guests} guests planned. Choose a larger venue or change the guest count before adding a suggested group.</p><button type="button" className="secondary-button" onClick={() => setField("selections")(current => ({ ...current, venue: undefined }))}>See venues that fit</button></div>}
        {allCategoriesChosen ? <p className="helper">All seven vendor categories are already in your plan.</p>
          : searching ? <p role="status">Finding options from the vendor directory…</p>
          : error?.key === key && !venueTooSmall ? <div className="alert" role="alert"><p>{error.message}</p><button type="button" className="secondary-button" onClick={() => { setError(null); setRetryCount(count => count + 1); }}>Try again</button></div>
          : response ? <p className="helper">{response.note}</p> : null}
        {phase === "venue" && response && <ul className="recommendation-list">{recommended.map(vendor => <li key={vendor.id}><div><strong>{vendor.name}</strong><p>{vendor.borough} · {vendor.isSynthetic ? "Sample price" : "Listed price"}: {samplePrice(vendor)} · Capacity: {capacityLabel(vendor)}</p></div><button type="button" className="secondary-button" onClick={() => chooseVenue(vendor.id)}>Choose venue</button></li>)}</ul>}
        {phase === "vendors" && <><p className="helper">Suggestions prefer the chosen venue’s borough. Listed prices and capacities are planning clues, not confirmed quotes or availability.</p><ul className="recommendation-list"><li><div><strong>Venue</strong><p>{venue?.name ?? "Venue details unavailable"} · selected by you</p>{venue && <small>{venue.isSynthetic ? "Sample price" : "Listed price"}: {samplePrice(venue)}</small>}</div>{budgetField("venue", venue?.priceMin ?? null)}</li>{vendorServices.map(service => {
          const selected = vendors.find(vendor => vendor.id === plan.selections[service]);
          const suggested = suggestedByService.get(service);
          const possible = !suggested && !selected && !searching && !venueTooSmall ? possibleOption(service) : undefined;
          const overBy = possible?.priceMin === null || possible?.priceMin === undefined ? 0 : Math.round((knownStartingTotal + possible.priceMin - budget) * 100);
          const emptyText = venueTooSmall ? "Choose a venue that fits your guests first" : searching ? "Checking the directory…" : possible ? `Possible option: ${possible.name} · ${possible.borough}${overBy > 0 ? ` · would put known starting prices ${money(overBy)} over budget` : possible.priceMin === null ? " · price unknown" : " · review before adding"}` : "No listing fits your guests and category budget";
          return <li key={service}><div><strong>{serviceLabels[service]}</strong><p>{selected ? `${selected.name} · already in your plan` : suggested ? `${suggested.name} · ${suggested.borough}` : emptyText}</p>{suggested && <small>{suggested.isSynthetic ? "Sample price" : "Listed price"}: {samplePrice(suggested)} · Capacity: {capacityLabel(suggested)}</small>}</div>{budgetField(service, (suggested ?? selected)?.priceMin ?? null)}</li>;
        })}</ul><div className="category-budget-total"><strong>Known starting prices with this group: {money(Math.round(knownStartingTotal * 100))}</strong><span>{unknownStartingPrices ? `${unknownStartingPrices} price${unknownStartingPrices === 1 ? "" : "s"} still unknown` : knownStartingTotal > budget ? `${money(Math.round((knownStartingTotal - budget) * 100))} over event budget` : `${money(Math.round((budget - knownStartingTotal) * 100))} under event budget`}</span></div><div className="category-budget-total"><strong>Assigned category budgets: {money(allocation.assignedCents)}</strong><span>{allocation.unassignedCents === null ? "Set a total event budget above." : allocation.unassignedCents < 0 ? `${money(-allocation.unassignedCents)} over your total event budget` : `${money(allocation.unassignedCents)} not assigned yet`}</span></div><p className="helper">Suggested budgets use the event total and listed starting prices, with part of the spare budget left unassigned. They are planning allowances, not vendor quotes.</p>{suggestedBudgets.unfilled.length > 0 && <p className="alert" role="status">There is not enough unassigned budget to suggest an amount for every choice. Increase the total or lower an existing category budget.</p>}{recommended.length > 0 && !allCategoriesChosen && <button type="button" className="primary-button" onClick={chooseGroup} disabled={venueTooSmall || (allocation.unassignedCents !== null && allocation.unassignedCents < 0) || suggestedBudgets.unfilled.length > 0}>Add suggested group and budgets</button>}</>}
        <p className="helper">Prefer to decide yourself? <a href="#vendor-search">Browse all vendors below.</a></p>
      </>}
  </section>;
}
