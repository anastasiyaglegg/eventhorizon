"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { findScheduleOverlaps, validSchedule } from "../../lib/schedule-conflicts";
import { capacityLabel, samplePrice, searchVendors, searchVendorNames, type Vendor } from "../../lib/vendor-search";
import { serviceLabels, useEventPlan, type Service } from "../../client/event-plan";
import { budgetAfterVendorChoice, budgetSummary, buildBudgetFindings, money } from "../../lib/budget";
import { themeName } from "../../lib/event-themes";
import { formatTimeEntry } from "../../lib/time-input";
import { RecommendationPanel } from "../../client/recommendation-panel";
import { VendorDetailsDialog } from "../../client/vendor-details";
import { selectedPlanRows, vendorResultAction } from "../../lib/planning-findings";

const example = "Find a caterer in Brooklyn for 80 guests under $3,000";
const categoryIcons: Record<string, string> = {
  catering: "🍴", bakery: "🥖", venue: "🏛️", av: "🎛️", photography: "📷", florist: "🌸", decorator: "🎈", entertainment: "🎵",
};

type VendorSlot = { date: string; start: string; end: string };
type EventPlanStatus = "considering" | "contacted" | "confirmed";

type Turn = { query: string; message: string; matches: Vendor[]; possibleMatches: Vendor[] };

export default function VendorFinder() {
  const { plan, hydrated, setField, vendors, directorySource, directoryWarning, directoryError } = useEventPlan();
  const { name, themeId, selections, vendorSlots, vendorStatuses, categoryBudgets, budgetLimit, otherEvents, eventDate, eventStart, eventEnd, eventGuests } = plan;
  const eventName = name.trim();
  const selectedTheme = themeName(themeId);
  const plannedVendors = selectedPlanRows(plan, vendors);
  const setSelections = setField("selections"), setVendorSlots = setField("vendorSlots");
  const setVendorStatuses = setField("vendorStatuses"), setCategoryBudgets = setField("categoryBudgets"), setBudgetLimit = setField("budgetLimit");
  const budget = budgetSummary(plan);
  const budgetFindings = buildBudgetFindings(plan, vendors);
  const setEventName = setField("name"), setEventDate = setField("eventDate"), setEventStart = setField("eventStart"), setEventEnd = setField("eventEnd"), setEventGuests = setField("eventGuests");
  const [venueRemoved, setVenueRemoved] = useState(false);
  useEffect(() => { if (selections.venue) setVenueRemoved(false); }, [selections.venue]);
  const [detailsVendor, setDetailsVendor] = useState<Vendor | null>(null);
  const detailsButton = (vendor: Vendor) => <button type="button" className="vendor-name-button" onClick={() => setDetailsVendor(vendor)} aria-label={`View contact details for ${vendor.name}`}>{vendor.name}</button>;
  const [nameQuery, setNameQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [draftSlot, setDraftSlot] = useState<VendorSlot>({ date: "", start: "", end: "" });
  const [slotError, setSlotError] = useState<string | null>(null);
  const slotDialog = useRef<HTMLDialogElement>(null);
  function openSlot(id: string, name: string, slot?: VendorSlot) {
    setEditing({ id, name }); setDraftSlot(slot ?? { date: "", start: "", end: "" }); setSlotError(null);
    slotDialog.current?.showModal();
  }
  function saveSlot() {
    if (!editing) return;
    if (!validSchedule(draftSlot)) { setSlotError("Enter a date and valid same-day 24-hour start and end times."); return; }
    setVendorSlots(current => ({ ...current, [editing.id]: { ...draftSlot } }));
    slotDialog.current?.close();
  }
  function removeVendor(service: Service, id: string) {
    if (service === "venue") setVenueRemoved(true);
    setSelections(current => ({ ...current, [service]: undefined }));
    setVendorSlots(current => { const updated = { ...current }; delete updated[id]; return updated; });
    setVendorStatuses(current => { const updated = { ...current }; delete updated[id]; return updated; });
    setCategoryBudgets(current => { const updated = { ...current }; delete updated[service]; return updated; });
    showVendorAlternatives(service);
  }
  const dialogRef = useRef<HTMLDialogElement>(null);
  const validTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  function openPlanner(vendor?: Vendor) {
    if (vendor && Object.hasOwn(serviceLabels, vendor.service)) {
      const service = vendor.service as Service;
      const previousId = selections[service];
      setSelections(current => ({ ...current, [service]: vendor.id }));
      if (service === "venue") setVenueRemoved(false);
      setCategoryBudgets(current => {
        const amount = budgetAfterVendorChoice(current?.[service], previousId, vendor.id, vendor.priceMin);
        return amount === undefined ? current : { ...current, [service]: amount };
      });
      if (previousId && previousId !== vendor.id) {
        setVendorSlots(current => { const updated = { ...current }; delete updated[previousId]; return updated; });
        setVendorStatuses(current => { const updated = { ...current }; delete updated[previousId]; return updated; });
      }
    }
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }
  const [turns, setTurns] = useState<Turn[]>([]);
  function showExample() {
    const result = searchVendors(example, {}, vendors);
    setTurns([{ query: example, message: result.message, matches: result.matches, possibleMatches: result.possibleMatches }]);
    setNameQuery("");
  }

  function browseCategory(service: Service) {
    const result = searchVendors(service, {}, vendors);
    setTurns([{ query: serviceLabels[service], message: result.message, matches: result.matches, possibleMatches: result.possibleMatches }]); setNameQuery("");
  }

  function showVendorAlternatives(service: Service) {
    browseCategory(service);
    dialogRef.current?.close();
    window.requestAnimationFrame(() => document.getElementById("vendor-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function searchByName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = nameQuery.trim();
    if (name.length < 2) return;
    const found = searchVendorNames(name, vendors);
    const message = found.length === 0 ? `No vendors found with “${name}” in their name.` : `Found ${found.length} ${found.length === 1 ? "vendor" : "vendors"} matching “${name}”.`;
    setTurns([{ query: name, message, matches: found, possibleMatches: [] }]);
    setNameQuery("");
  }

  return (
    <main className="page-shell vendor-finder">
      <Link href="/">← Choose a theme</Link>
      <header className="page-heading vendor-finder-heading">
        <div>
          <p className="eyebrow">Event Horizon · Search &amp; add vendors</p>
          <h1>{eventName || "Name your event"}</h1>
          <p className="event-theme">Theme: {selectedTheme ?? <Link href="/">Choose a theme</Link>}</p>
          <p className="subtitle">Find caterers, bakeries, florists, venues, AV providers, photographers, decorators, and entertainment.</p>
          <p className="scope-note">Explore options here, then contact each business to confirm a reservation.</p>
        </div>
        <span className="status-pill">{directorySource === "supabase" ? "Real vendor listings" : "Example vendor listings"}</span>
      </header>
      <section className="panel planned-summary" aria-labelledby="planned-title">
        <h2 id="planned-title">Start with your event</h2>
        <p className="helper">Your choices are saved on this device. Mark a vendor confirmed only after they have agreed to the booking.</p>
        <label className="field event-name-field">Event name <input value={name} maxLength={120} placeholder="Give your event a name" onChange={e => setEventName(e.target.value)} /></label>
        <div className="booking-fields"><label className="field">Total budget ($) <input inputMode="decimal" placeholder="Set a budget" value={budgetLimit} onChange={event => { if (/^$|^\d{1,9}(?:\.\d{0,2})?$/.test(event.target.value)) setBudgetLimit(event.target.value); }} /></label><label className="field">Planned number of guests <input type="number" min="1" step="1" value={eventGuests} onChange={e => setEventGuests(e.target.value)} /></label><label className="field">Event date <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} /></label><label className="field">Event start (24-hour; type 1800) <input inputMode="numeric" value={eventStart} placeholder="1800" maxLength={5} onChange={e => setEventStart(formatTimeEntry(e.target.value))} /></label><label className="field">Event end (24-hour; type 2000) <input inputMode="numeric" value={eventEnd} placeholder="2000" maxLength={5} onChange={e => setEventEnd(formatTimeEntry(e.target.value))} /></label></div>
        <RecommendationPanel />
        <div className="chosen-plan"><div className="chosen-plan-heading"><span className="chosen-plan-label">Your plan</span><h3>Your chosen vendors</h3><p>Only these selections are in your event plan. Suggestions above are optional until you add them.</p></div>
        {hydrated && !selections.venue && (venueRemoved
          ? <p className="booking-missing">Venue removed. Choose a replacement venue before continuing.</p>
          : <p className="alert" role="alert">A venue is required. Choose one before continuing.</p>)}
        <ul className="planned-list">{plannedVendors.map(({ service, id, name: selectedName, vendor }) => {
          const label = serviceLabels[service];
          const slot = vendorSlots[id];
          const scheduled = !!slot && validSchedule(slot);
          const overlaps = service !== "venue" && slot ? findScheduleOverlaps({ id, name: selectedName, slot }, otherEvents) : [];
          const venueSlot = selections.venue ? vendorSlots[selections.venue] : undefined;
          const outsideVenue = service !== "venue" && !!slot && !!venueSlot && validSchedule(slot) && validSchedule(venueSlot) && slot.date === venueSlot.date && (slot.start < venueSlot.start || slot.end > venueSlot.end);
          return <li className="planned-item" key={service}><div>
            <strong>{label}: {vendor ? detailsButton(vendor) : selectedName}</strong>
            {!vendor && <p className="helper">Details did not load. You can set a time, remove this choice, or find a replacement below.</p>}
            <p>{scheduled && slot ? `${slot.date} · ${slot.start}–${slot.end}` : <span className="booking-missing">Date and time not set</span>}{service === "venue" && (eventGuests ? ` · ${eventGuests} planned guests` : <span className="booking-missing"> · Guest count not set</span>)}</p>
            {overlaps.length > 0 && <p className="booking-conflict">Room conflict with {overlaps.map(item => item.name).join(", ")}. Change the event or vendor time.</p>}
            {outsideVenue && <p className="booking-conflict">Outside the venue access hours.</p>}
            {service !== "venue" && slot && venueSlot && validSchedule(slot) && validSchedule(venueSlot) && slot.date !== venueSlot.date && <p className="helper">Confirm venue access for this separate date.</p>}
          </div><div className="vendor-progress">
            <label>Status<select aria-label={`${selectedName} status`} value={vendorStatuses[id] ?? "considering"} onChange={event => setVendorStatuses(current => ({ ...current, [id]: event.target.value as EventPlanStatus }))}><option value="considering">Considering</option><option value="contacted">Contacted</option><option value="confirmed">Confirmed by vendor</option></select></label>
            <label>Budget for {label} ($)<input aria-label={`${selectedName} budget`} inputMode="decimal" placeholder="Set planned amount" value={categoryBudgets?.[service] ?? ""} onChange={event => { if (/^$|^\d{1,8}(?:\.\d{0,2})?$/.test(event.target.value)) setCategoryBudgets(current => ({ ...current, [service]: event.target.value })); }} /></label>
          </div><div className="decision-row"><button type="button" className="secondary-button" onClick={() => openSlot(id, selectedName, slot)}>Set date and time</button><button type="button" className="secondary-button" aria-label={`Remove ${selectedName}`} onClick={() => removeVendor(service, id)}>Remove</button><button type="button" className="secondary-button" aria-label={`Replace ${selectedName}`} onClick={() => showVendorAlternatives(service)}>Replace</button></div></li>;
        })}</ul>
        <section className="budget-snapshot" aria-label="Budget snapshot"><div><h3>Budget snapshot</h3><p className="helper">Only chosen vendors count in planned spend. Listed prices are for comparison and still need confirmation.</p></div><div className="budget-numbers"><div><span>Planned spend</span><strong>{money(budget.plannedCents)}</strong></div><div><span>{budget.remainingCents !== null && budget.remainingCents < 0 ? "Over budget" : "Remaining"}</span><strong>{budget.remainingCents === null ? "Set a budget" : money(Math.abs(budget.remainingCents))}</strong></div><div><span>Vendors without a budget</span><strong>{budget.unbudgetedCount}</strong></div></div>{budgetFindings.map(item => <p className={item.tone === "needs-action" ? "booking-conflict" : "helper"} key={item.id}>{item.detail}</p>)}</section></div>
      </section>
      <section className="panel" id="vendor-search" aria-labelledby="search-heading">
        <h2 id="search-heading">What do you need for your event?</h2>
        <p className="helper">{directorySource === "supabase"
          ? "Vendor details come from the connected directory. Prices, capacity, and availability marked demo are fictional. Confirm real details with each vendor."
          : "Sample vendors, contacts, prices, ratings, and reviews are fictional. Availability is unknown."}</p>
        {directoryError && <p className="alert" role="alert">{directoryError}</p>}
        {directoryWarning && <p className="alert" role="status">{directoryWarning}</p>}
        {directorySource === "supabase" && vendors.length === 0 && <p className="empty-state">No vendor listings are available yet.</p>}
        <h3>Browse by category</h3>
        <div className="vendor-categories" aria-label="Vendor categories">{(Object.entries(serviceLabels) as [Service, string][]).map(([service, label]) => <button className="secondary-button" type="button" key={service} onClick={() => browseCategory(service)}><span aria-hidden="true">{categoryIcons[service]}</span> {label}</button>)}</div>
        <form className="vendor-name-search" onSubmit={searchByName} aria-label="Find a vendor by name">
          <label className="field">Find a specific vendor
            <input value={nameQuery} onChange={event => setNameQuery(event.target.value)} placeholder="Type a business name, e.g. Buds of Brooklyn" maxLength={200} />
          </label>
          <button className="primary-button" disabled={nameQuery.trim().length < 2}>Search by name</button>
        </form>
        <button className="secondary-button vendor-example" type="button" onClick={showExample}>
          {example}
        </button>
        <div id="vendor-results" role="log" aria-label="Vendor search conversation">
          {hydrated && venueRemoved && !selections.venue && <p className="alert" role="alert">Venue removed. Choose a replacement venue from the options below before continuing.</p>}
          {turns.map((turn, index) => (
            <div className="vendor-turn" key={index}>
              <p><strong>You:</strong> {turn.query}</p>
              <p><strong>Vendor finder:</strong> {turn.message}</p>
              {turn.matches.length + turn.possibleMatches.length > 0 && <ul className="vendor-results">
                {[...turn.matches.map(vendor => ({ vendor, possible: false })), ...turn.possibleMatches.map(vendor => ({ vendor, possible: true }))].map(({ vendor, possible }) => <li className="fact" key={vendor.id}>
                  <div className="vendor-card-heading">
                    <div>
                      <p className="eyebrow"><span aria-hidden="true">{categoryIcons[vendor.service]}</span> {vendor.service} · {vendor.borough}</p>
                      <h3>{detailsButton(vendor)}</h3>
                    </div>
                    {possible && <span className="tag warn">Possible fit · confirm missing details</span>}
                    {vendor.rating !== null && <span className="tag good"><span aria-hidden="true">★&nbsp;</span> {vendor.rating.toFixed(1)} / 5 {vendor.isSynthetic ? "sample rating" : `rating${vendor.reviewCount === null ? "" : ` · ${vendor.reviewCount} reviews`}`}</span>}
                  </div>
                  <p>{vendor.details}</p>
                  <p className="helper">{vendor.priceMin === null && vendor.priceMax === null ? "Sample price $2,000 (fictional)" : `${vendor.isSynthetic ? "Sample price" : "Listed price"} ${samplePrice(vendor)}`} · {vendor.capacityMin === null && vendor.capacityMax === null ? "Demo capacity 100 guests (fictional)" : `Capacity ${capacityLabel(vendor)}`} · Demo availability: available (fictional)</p>
                  <p className="helper">Demo values are examples only and are not used to determine matches. Contact the vendor to confirm actual details.</p>
                  {(vendor.contactEmail || vendor.sourceUrl) && <p className="helper">{vendor.isSynthetic ? "Sample contact" : "Contact"} {vendor.contactEmail && <span className="vendor-contact">{vendor.contactEmail}</span>}{vendor.contactEmail && vendor.sourceUrl && " · "}{vendor.sourceUrl && <a href={vendor.sourceUrl} target="_blank" rel="noopener noreferrer">Visit website</a>}</p>}
                  {!vendor.sourceUrl && <p className="helper">Website not available</p>}
                  <button className="secondary-button" type="button" disabled={vendorResultAction(vendor, selections).disabled} onClick={() => openPlanner(vendor)}>{vendorResultAction(vendor, selections).label}</button>
                  {vendor.review && <blockquote className="vendor-review">
                    <span className="fact-label">{vendor.isSynthetic ? "Sample review" : "Review summary"}</span>
                    <p>“{vendor.review}”</p>
                  </blockquote>}
                </li>)}
              </ul>}
            </div>
          ))}
        </div>
      </section>
      <div className="journey-next">{selections.venue ? <Link className="primary-button" href="/calendar">Next: view calendar →</Link> : <button className="primary-button" type="button" disabled title="Choose a venue to continue">Next: view calendar →</button>}</div>
      <dialog ref={dialogRef} className="booking-dialog" aria-labelledby="booking-title">
        <div className="booking-heading"><div><p className="eyebrow">Event Horizon · Vendor plan</p><h2 id="booking-title">{eventName || "Name your event"}</h2><p className="event-theme">Theme: {selectedTheme ?? "Not chosen yet"}</p></div><button type="button" className="secondary-button" onClick={() => dialogRef.current?.close()}>Close</button></div>
        <p className="helper">These are planning choices. Contact each business to confirm a reservation.</p>
        <h3>Vendors added to this event</h3>
        {plannedVendors.length === 0 && <p className="empty-state">No vendors added yet. Browse categories or search for one on this page.</p>}
        <ul className="booking-list">{plannedVendors.map(({ service, id, name: selectedName, vendor: selected }) => {
          const label = serviceLabels[service];
          const slot = vendorSlots[id];
          const slotValid = !!slot && validTime(slot.start) && validTime(slot.end) && slot.start < slot.end;
          return <li key={service} className="booking-row">
              <strong>{label}: {selected ? detailsButton(selected) : selectedName}</strong>{selected?.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Visit website</a>}
              <p>{slotValid && slot?.date ? `${slot.date} · ${slot.start}–${slot.end}` : <span className="booking-missing">Missing date or time</span>}</p>
              <div className="decision-row"><button className="secondary-button" type="button" onClick={() => openSlot(id, selectedName, slot)}>Set date and time</button><button className="secondary-button" type="button" onClick={() => removeVendor(service, id)}>Remove</button><button className="secondary-button" type="button" onClick={() => showVendorAlternatives(service)}>Replace</button></div>
              {slot && (() => {
                const overlaps = service !== "venue" ? findScheduleOverlaps({ id, name: selectedName, slot }, otherEvents) : [];
                const venueSlot = selections.venue ? vendorSlots[selections.venue] : undefined;
                const outsideVenue = service !== "venue" && !!venueSlot && validSchedule(venueSlot) && validSchedule(slot) && (slot.date === venueSlot.date && (slot.start < venueSlot.start || slot.end > venueSlot.end));
                return <>{overlaps.length > 0 && <p className="booking-conflict" role="status">Room conflict with {overlaps.map(item => item.name).join(", ")}. Change the event or vendor time.</p>}{outsideVenue && <p className="booking-conflict" role="status">Outside the venue access hours. Change the time or remove this planned vendor.</p>}{service !== "venue" && venueSlot && validSchedule(venueSlot) && slot.date !== venueSlot.date && <p className="helper">Confirm venue access for this separate date.</p>}</>;
              })()}
          </li>;
        })}</ul>
      </dialog>
      <dialog ref={slotDialog} className="booking-dialog" aria-labelledby="slot-title">
        <div className="booking-heading"><div><p className="eyebrow">{eventName || "Name your event"} · {selectedTheme ?? "No theme chosen"}</p><h2 id="slot-title">Schedule {editing?.name ?? "vendor"}</h2></div><button type="button" className="secondary-button" onClick={() => slotDialog.current?.close()}>Close</button></div>
        <div className="booking-fields"><label className="field">Date <input type="date" value={draftSlot.date} onChange={e => setDraftSlot(current => ({ ...current, date: e.target.value }))} /></label><label className="field">Start (24-hour; type four digits) <input type="text" inputMode="numeric" placeholder="1700" maxLength={5} value={draftSlot.start} onChange={e => setDraftSlot(current => ({ ...current, start: formatTimeEntry(e.target.value) }))} /></label><label className="field">End (24-hour; type four digits) <input type="text" inputMode="numeric" placeholder="1900" maxLength={5} value={draftSlot.end} onChange={e => setDraftSlot(current => ({ ...current, end: formatTimeEntry(e.target.value) }))} /></label></div>
        {slotError && <p className="booking-missing" role="alert">{slotError}</p>}
        {editing && (() => {
          const scheduled = plannedVendors.flatMap(({ service, id, name: selectedName }) => {
            if (service === "venue" || id === editing.id) return [];
            const slot = vendorSlots[id];
            return slot && validSchedule(slot) ? [{ service, name: selectedName, slot }] : [];
          });
          return <div><h3>Other scheduled vendors for this event</h3>{scheduled.length ? <ul>{scheduled.map(({ service, name: selectedName, slot }) => <li key={service}>{selectedName}: {slot.date} · {slot.start}–{slot.end}</li>)}</ul> : <p>No other vendors scheduled for this event yet.</p>}</div>;
        })()}
        <div className="decision-row"><button type="button" className="primary-button" onClick={saveSlot}>Save time</button><button type="button" className="secondary-button" onClick={() => slotDialog.current?.close()}>Cancel</button></div>
      </dialog>
      <VendorDetailsDialog vendor={detailsVendor} onClose={() => setDetailsVendor(null)} />
    </main>
  );
}
