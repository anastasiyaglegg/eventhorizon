"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { evaluateSchedule, scheduleReviewResponseSchema, type ScheduleIssue, type ScheduleReviewResponse } from "../../lib/schedule-rules";
import { findScheduleOverlaps, overlapsForOtherEvent, validSchedule } from "../../lib/schedule-conflicts";
import { capacityLabel, samplePrice, searchVendors, searchVendorNames, type VendorCriteria, type Vendor } from "../../lib/vendor-search";
import { serviceLabels, useEventPlan, type Service } from "../../client/event-plan";
import { budgetSummary, money } from "../../lib/budget";
import { themeName } from "../../lib/event-themes";
import { formatTimeEntry } from "../../lib/time-input";

const example = "Find a caterer in Brooklyn for 80 guests under $3,000";
const categoryIcons: Record<string, string> = {
  catering: "🍴", bakery: "🥖", venue: "🏛️", av: "🎛️", photography: "📷", florist: "🌸", decorator: "🎈", entertainment: "🎵",
};

type VendorSlot = { date: string; start: string; end: string };
type EventPlanStatus = "considering" | "contacted" | "confirmed";

type Turn = { query: string; message: string; matches: Vendor[]; possibleMatches: Vendor[] };

export default function VendorFinder() {
  const { plan, setField, vendors, directorySource, directoryWarning, directoryError } = useEventPlan();
  const { name, themeId, selections, vendorSlots, vendorStatuses, vendorEstimates, budgetLimit, otherEvents, eventDate, eventStart, eventEnd, eventGuests } = plan;
  const eventName = name.trim();
  const selectedTheme = themeName(themeId);
  const plannedVendors = (Object.entries(selections) as [Service, string | undefined][]).flatMap(([service, id]) => {
    const vendor = vendors.find(item => item.id === id);
    return vendor ? [{ service, vendor }] : [];
  });
  const setSelections = setField("selections"), setVendorSlots = setField("vendorSlots"), setOtherEvents = setField("otherEvents");
  const setVendorStatuses = setField("vendorStatuses"), setVendorEstimates = setField("vendorEstimates"), setBudgetLimit = setField("budgetLimit");
  const budget = budgetSummary(plan);
  const plannedVendorEvents = (Object.entries(selections) as [Service, string | undefined][]).flatMap(([service, id]) => {
    if (service === "venue" || !id || !vendorSlots[id]) return [];
    const vendor = vendors.find(item => item.id === id);
    return vendor ? [{ id, name: vendor.name, slot: vendorSlots[id] }] : [];
  });
  const mainSlot = { date: eventDate, start: eventStart, end: eventEnd };
  const roomOccupants = [...plannedVendorEvents, ...(validSchedule(mainSlot) ? [{ id: "main-event", name: plan.name, slot: mainSlot }] : [])];
  const setEventName = setField("name"), setEventDate = setField("eventDate"), setEventStart = setField("eventStart"), setEventEnd = setField("eventEnd"), setEventGuests = setField("eventGuests");
  const [query, setQuery] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [editing, setEditing] = useState<{ kind: "vendor" | "event"; id: string; name: string } | null>(null);
  const [draftSlot, setDraftSlot] = useState<VendorSlot>({ date: "", start: "", end: "" });
  const [draftName, setDraftName] = useState("");
  const [slotError, setSlotError] = useState<string | null>(null);
  const slotDialog = useRef<HTMLDialogElement>(null);
  function openSlot(kind: "vendor" | "event", id: string, name: string, slot?: VendorSlot) {
    setEditing({ kind, id, name }); setDraftName(name); setDraftSlot(slot ?? { date: "", start: "", end: "" }); setSlotError(null);
    slotDialog.current?.showModal();
  }
  function saveSlot() {
    if (!editing) return;
    if (!validSchedule(draftSlot) || (editing.kind === "event" && !draftName.trim())) { setSlotError("Enter a name, date, and valid same-day 24-hour start and end times."); return; }
    clearCheck();
    if (editing.kind === "vendor") setVendorSlots(current => ({ ...current, [editing.id]: { ...draftSlot } }));
    else setOtherEvents(current => [...current.filter(event => event.id !== editing.id), { id: editing.id, name: draftName.trim(), slot: { ...draftSlot } }]);
    slotDialog.current?.close();
  }
  function removeVendor(service: Service, id: string) {
    clearCheck(); setSelections(current => ({ ...current, [service]: undefined }));
    setVendorSlots(current => { const updated = { ...current }; delete updated[id]; return updated; });
    setVendorStatuses(current => { const updated = { ...current }; delete updated[id]; return updated; });
    setVendorEstimates(current => { const updated = { ...current }; delete updated[id]; return updated; });
  }
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [ruleIssues, setRuleIssues] = useState<ScheduleIssue[] | null>(null);
  const [checkReport, setCheckReport] = useState<ScheduleReviewResponse | null>(null);
  const checkAbort = useRef<AbortController | null>(null);
  const checkSequence = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  function clearCheck() {
    checkSequence.current++; checkAbort.current?.abort(); checkAbort.current = null;
    setCheckBusy(false); setCheckError(null); setRuleIssues(null); setCheckReport(null);
  }
  useEffect(() => () => { checkAbort.current?.abort(); }, []);
  async function checkVendor() {
    clearCheck();
    const selected = (Object.entries(selections) as [Service, string | undefined][]).filter(([service, id]) => service !== "venue" && !!id).flatMap(([service, id]) => {
      const vendor = vendors.find(v => v.id === id);
      // The schedule check accepts names up to 200 characters; directory names are not capped.
      return vendor ? [{ id: vendor.id, name: vendor.name.slice(0, 200), category: service, slot: vendorSlots[vendor.id] ?? null }] : [];
    });
    const input = { version: "schedule-review.v1", event: { date: eventDate, start: eventStart, end: eventEnd }, vendors: selected };
    try { setRuleIssues(evaluateSchedule(input).issues); }
    catch { setCheckError("Enter a valid event date, same-day start and end time, and select at least one vendor."); return; }
    const sequence = ++checkSequence.current, controller = new AbortController();
    checkAbort.current = controller; setCheckBusy(true);
    try {
      const response = await fetch("/api/schedule-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: controller.signal, cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) { const err = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "Agent review could not finish."; throw new Error(err); }
      const parsed = scheduleReviewResponseSchema.safeParse(payload);
      if (!parsed.success) throw new Error("The schedule suggestions could not be read. Please try again.");
      if (sequence === checkSequence.current) { setRuleIssues(parsed.data.issues); setCheckReport(parsed.data); }
    } catch (error) {
      if (!controller.signal.aborted && sequence === checkSequence.current) setCheckError(error instanceof Error ? error.message : "The agent check could not finish.");
    } finally { if (sequence === checkSequence.current) { setCheckBusy(false); checkAbort.current = null; } }
  }
  const validTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  function openPlanner(vendor?: Vendor) {
    if (vendor && Object.hasOwn(serviceLabels, vendor.service)) {
      clearCheck();
      setSelections(current => ({ ...current, [vendor.service]: vendor.id }));
    }
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }
  const [criteria, setCriteria] = useState<VendorCriteria>({});
  const [turns, setTurns] = useState<Turn[]>([]);
  function search(text: string) {
    const prompt = text.trim();
    if (!prompt) return;
    const result = searchVendors(prompt, criteria, vendors);
    setCriteria(result.criteria);
    setTurns(current => [...current, { query: prompt, message: result.message, matches: result.matches, possibleMatches: result.possibleMatches }]);
    setQuery(""); setNameQuery("");
  }

  function browseCategory(service: Service) {
    const result = searchVendors(service, {}, vendors);
    setCriteria(result.criteria); setTurns([{ query: serviceLabels[service], message: result.message, matches: result.matches, possibleMatches: result.possibleMatches }]); setQuery(""); setNameQuery("");
  }

  function searchByName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = nameQuery.trim();
    if (name.length < 2) return;
    const found = searchVendorNames(name, vendors);
    const visible = found.filter(vendor => !Object.values(selections).includes(vendor.id));
    const message = found.length === 0 ? `No vendors found with “${name}” in their name.` : visible.length === 0 ? "This vendor is already in your event plan." : `Found ${visible.length} ${visible.length === 1 ? "vendor" : "vendors"} matching “${name}”.`;
    setCriteria({});
    setTurns([{ query: name, message, matches: visible, possibleMatches: [] }]);
    setNameQuery(""); setQuery("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    search(query);
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
        <h2 id="planned-title">Your event plan</h2>
        <p className="helper">Your choices are saved on this device. Mark a vendor confirmed only after they have agreed to the booking.</p>
        <label className="field event-name-field">Event name <input value={name} maxLength={120} placeholder="Give your event a name" onChange={e => { clearCheck(); setEventName(e.target.value); }} /></label>
        <div className="booking-fields"><label className="field">Event date <input type="date" value={eventDate} onChange={e => { clearCheck(); setEventDate(e.target.value); }} /></label><label className="field">Event start (24-hour; type 1800) <input inputMode="numeric" value={eventStart} placeholder="1800" maxLength={5} onChange={e => { clearCheck(); setEventStart(formatTimeEntry(e.target.value)); }} /></label><label className="field">Event end (24-hour; type 2000) <input inputMode="numeric" value={eventEnd} placeholder="2000" maxLength={5} onChange={e => { clearCheck(); setEventEnd(formatTimeEntry(e.target.value)); }} /></label><label className="field">Planned number of guests <input type="number" min="1" step="1" value={eventGuests} onChange={e => setEventGuests(e.target.value)} /></label></div>
        {!selections.venue && <p className="booking-missing">Venue not selected</p>}
        <ul className="planned-list">{(Object.entries(serviceLabels) as [Service, string][]).map(([service, label]) => {
          const vendor = vendors.find(v => v.id === selections[service]);
          if (!vendor) return null;
          const slot = vendorSlots[vendor.id];
          const scheduled = !!slot && validSchedule(slot);
          const overlaps = service !== "venue" && slot ? findScheduleOverlaps({ id: vendor.id, name: vendor.name, slot }, otherEvents) : [];
          const venueSlot = selections.venue ? vendorSlots[selections.venue] : undefined;
          const outsideVenue = service !== "venue" && !!slot && !!venueSlot && validSchedule(slot) && validSchedule(venueSlot) && (slot.date === venueSlot.date && (slot.start < venueSlot.start || slot.end > venueSlot.end));
          return <li className="planned-item" key={service}><div><strong>{label}: {vendor.name}</strong><p>{scheduled && slot ? `${slot.date} · ${slot.start}–${slot.end}` : <span className="booking-missing">Date and time not set</span>}{service === "venue" && (eventGuests ? ` · ${eventGuests} planned guests` : <span className="booking-missing"> · Guest count not set</span>)}</p>{overlaps.length > 0 && <p className="booking-conflict">Room conflict with {overlaps.map(item => item.name).join(", ")}. Change the event or vendor time.</p>}{outsideVenue && <p className="booking-conflict">Outside the venue access hours.</p>}{service !== "venue" && slot && venueSlot && validSchedule(slot) && validSchedule(venueSlot) && slot.date !== venueSlot.date && <p className="helper">Confirm venue access for this separate date.</p>}</div><div className="vendor-progress"><label>Status<select aria-label={`${vendor.name} status`} value={vendorStatuses[vendor.id] ?? "considering"} onChange={event => setVendorStatuses(current => ({ ...current, [vendor.id]: event.target.value as EventPlanStatus }))}><option value="considering">Considering</option><option value="contacted">Contacted</option><option value="confirmed">Confirmed by vendor</option></select></label><label>Estimated cost ($)<input aria-label={`${vendor.name} estimated cost`} inputMode="decimal" placeholder="Unknown" value={vendorEstimates[vendor.id] ?? ""} onChange={event => { if (/^$|^\d{1,8}(?:\.\d{0,2})?$/.test(event.target.value)) setVendorEstimates(current => ({ ...current, [vendor.id]: event.target.value })); }} /></label></div><div className="decision-row"><button type="button" className="secondary-button" onClick={() => openSlot("vendor", vendor.id, vendor.name, slot)}>Change date and time</button><button type="button" className="secondary-button" onClick={() => removeVendor(service, vendor.id)}>Remove</button></div></li>;
        })}</ul>
        <section className="budget-snapshot" aria-label="Budget snapshot"><div><h3>Budget snapshot</h3><p className="helper">Estimates you enter here are for planning; unknown prices stay unknown.</p></div><label>Total budget ($)<input inputMode="decimal" placeholder="Set a budget" value={budgetLimit} onChange={event => { if (/^$|^\d{1,9}(?:\.\d{0,2})?$/.test(event.target.value)) setBudgetLimit(event.target.value); }} /></label><div className="budget-numbers"><div><span>Known estimates</span><strong>{money(budget.estimatedCents)}</strong></div><div><span>{budget.remainingCents !== null && budget.remainingCents < 0 ? "Over budget" : "Remaining"}</span><strong>{budget.remainingCents === null ? "Set a budget" : money(Math.abs(budget.remainingCents))}</strong></div><div><span>Prices to confirm</span><strong>{budget.unknownCount}</strong></div></div></section>
      </section>
      <section className="panel" aria-labelledby="schedule-tools-title">
        <h2 id="schedule-tools-title">Event schedule</h2>
        <p className="helper">Manage another event in the shared room here, or see everything on the <Link href="/calendar">visual calendar</Link>.</p>
        <section aria-labelledby="other-events-title"><h3 id="other-events-title">Other events to check</h3><p className="helper">All events use one room. Overlapping events or vendor setup times need a change.</p>
          <button type="button" className="secondary-button" onClick={() => openSlot("event", crypto.randomUUID(), "")}>Add another event</button>
          {otherEvents.map(event => { const overlaps = overlapsForOtherEvent(event, otherEvents, roomOccupants); return <div key={event.id} className="booking-row"><p>{event.name}: {event.slot.date} · {event.slot.start}–{event.slot.end}</p>{overlaps.length > 0 && <p className="booking-conflict" role="status">Room conflict with {overlaps.map(item => item.name).join(", ")}. Change an event or vendor time.</p>}<div className="decision-row"><button type="button" className="secondary-button" onClick={() => openSlot("event", event.id, event.name, event.slot)}>Change event</button><button type="button" className="secondary-button" onClick={() => { clearCheck(); setOtherEvents(current => current.filter(item => item.id !== event.id)); }}>Remove event</button></div></div>; })}
        </section>
        <section aria-labelledby="agent-check-title">
          <h3 id="agent-check-title">Check vendor schedules</h3>
          <p className="helper">Check all vendor times against your event. Florists and decorators may work together up to two days early. Other vendors may overlap and must start at least one hour before. Times use New York time; each booking starts and ends on the same day.</p>
          <button type="button" className="secondary-button" disabled={checkBusy} onClick={checkVendor}>{checkBusy ? "Checking schedules…" : "Check schedules"}</button>
          {checkError && <p className="booking-missing" role="alert">{checkError}</p>}
          {ruleIssues && <div role="status"><h4>Schedule findings</h4>{ruleIssues.length ? <ul>{ruleIssues.map(issue => <li key={issue.id} className="booking-missing">{issue.message}{checkReport && <> <strong>({checkReport.findings.find(f => f.issue_id === issue.id)?.priority ?? "normal"} priority)</strong> {checkReport.suggestions.find(item => item.issue_id === issue.id)?.text}</>}</li>)}</ul> : <p>No issues found under the timing rules.</p>}{checkReport && <p className="helper">Suggested next steps are ready. Review and confirm any changes yourself.</p>}</div>}
        </section>
      </section>
      <section className="panel" aria-labelledby="search-heading">
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
        <button className="secondary-button" type="button" onClick={() => openPlanner()}>View vendor plan</button>
        <button className="secondary-button vendor-example" type="button" onClick={() => search(example)}>
          {example}
        </button>
        <div role="log" aria-label="Vendor search conversation">
          {turns.map((turn, index) => (
            <div className="vendor-turn" key={index}>
              <p><strong>You:</strong> {turn.query}</p>
              <p><strong>Vendor finder:</strong> {turn.message}</p>
              {[...turn.matches.map(vendor => ({ vendor, possible: false })), ...turn.possibleMatches.map(vendor => ({ vendor, possible: true }))].some(({ vendor }) => !Object.values(selections).includes(vendor.id)) && <ul className="vendor-results">
                {[...turn.matches.map(vendor => ({ vendor, possible: false })), ...turn.possibleMatches.map(vendor => ({ vendor, possible: true }))].filter(({ vendor }) => !Object.values(selections).includes(vendor.id)).map(({ vendor, possible }) => <li className="fact" key={vendor.id}>
                  <div className="vendor-card-heading">
                    <div>
                      <p className="eyebrow"><span aria-hidden="true">{categoryIcons[vendor.service]}</span> {vendor.service} · {vendor.borough}</p>
                      <h3>{vendor.name}</h3>
                    </div>
                    {possible && <span className="tag warn">Possible fit · confirm missing details</span>}
                    {vendor.rating !== null && <span className="tag good"><span aria-hidden="true">★&nbsp;</span> {vendor.rating.toFixed(1)} / 5 {vendor.isSynthetic ? "sample rating" : `rating${vendor.reviewCount === null ? "" : ` · ${vendor.reviewCount} reviews`}`}</span>}
                  </div>
                  <p>{vendor.details}</p>
                  <p className="helper">{vendor.priceMin === null && vendor.priceMax === null ? "Demo price $2,000 (fictional)" : `${vendor.isSynthetic ? "Sample price" : "Listed price"} ${samplePrice(vendor)}`} · {vendor.capacityMin === null && vendor.capacityMax === null ? "Demo capacity 100 guests (fictional)" : `Capacity ${capacityLabel(vendor)}`} · Demo availability: available (fictional)</p>
                  <p className="helper">Demo values are examples only and are not used to determine matches. Contact the vendor to confirm actual details.</p>
                  {(vendor.contactEmail || vendor.sourceUrl) && <p className="helper">{vendor.isSynthetic ? "Sample contact" : "Contact"} {vendor.contactEmail && <span className="vendor-contact">{vendor.contactEmail}</span>}{vendor.contactEmail && vendor.sourceUrl && " · "}{vendor.sourceUrl && <a href={vendor.sourceUrl} target="_blank" rel="noopener noreferrer">Visit website</a>}</p>}
                  {!vendor.sourceUrl && <p className="helper">Website not available</p>}
                  <button className="secondary-button" type="button" onClick={() => openPlanner(vendor)}>Add {vendor.name} to plan</button>
                  {vendor.review && <blockquote className="vendor-review">
                    <span className="fact-label">{vendor.isSynthetic ? "Sample review" : "Review summary"}</span>
                    <p>“{vendor.review}”</p>
                  </blockquote>}
                </li>)}
              </ul>}
            </div>
          ))}
        </div>
        <form className="vendor-form" onSubmit={submit}>
          <label className="field">
            Your vendor request
            <input value={query} onChange={event => setQuery(event.target.value)} maxLength={300}
              placeholder={turns.length ? "Try a different borough or budget" : "Describe the vendor you need"} />
          </label>
          <div className="decision-row">
            <button className="primary-button" disabled={!query.trim()}>Find vendors</button>
            <button className="secondary-button" type="button" disabled={!turns.length}
              onClick={() => { setTurns([]); setCriteria({}); setQuery(""); setNameQuery(""); }}>New search</button>
          </div>
        </form>
      </section>
      <dialog ref={dialogRef} className="booking-dialog" aria-labelledby="booking-title" onClose={clearCheck}>
        <div className="booking-heading"><div><p className="eyebrow">Event Horizon · Vendor plan</p><h2 id="booking-title">{eventName || "Name your event"}</h2><p className="event-theme">Theme: {selectedTheme ?? "Not chosen yet"}</p></div><button type="button" className="secondary-button" onClick={() => dialogRef.current?.close()}>Close</button></div>
        <p className="helper">These are planning choices. Contact each business to confirm a reservation.</p>
        <h3>Vendors added to this event</h3>
        {plannedVendors.length === 0 && <p className="empty-state">No vendors added yet. Browse categories or search for one on this page.</p>}
        <ul className="booking-list">{plannedVendors.map(({ service, vendor: selected }) => {
          const label = serviceLabels[service];
          const slot = vendorSlots[selected.id];
          const slotValid = !!slot && validTime(slot.start) && validTime(slot.end) && slot.start < slot.end;
          return <li key={service} className="booking-row">
              <strong>{label}: {selected.name}</strong>{selected.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Visit website</a>}
              <p>{slotValid && slot?.date ? `${slot.date} · ${slot.start}–${slot.end}` : <span className="booking-missing">Missing date or time</span>}</p>
              <div className="decision-row"><button className="secondary-button" type="button" onClick={() => openSlot("vendor", selected.id, selected.name, slot)}>{slotValid && slot?.date ? "Change date and time" : "Choose date and time"}</button><button className="secondary-button" type="button" onClick={() => removeVendor(service, selected.id)}>Remove planned {label.toLowerCase()}</button></div>
              {slot && (() => {
                const overlaps = service !== "venue" ? findScheduleOverlaps({ id: selected.id, name: selected.name, slot }, otherEvents) : [];
                const venueSlot = selections.venue ? vendorSlots[selections.venue] : undefined;
                const outsideVenue = service !== "venue" && !!venueSlot && validSchedule(venueSlot) && validSchedule(slot) && (slot.date === venueSlot.date && (slot.start < venueSlot.start || slot.end > venueSlot.end));
                return <>{overlaps.length > 0 && <p className="booking-conflict" role="status">Room conflict with {overlaps.map(item => item.name).join(", ")}. Change the event or vendor time.</p>}{outsideVenue && <p className="booking-conflict" role="status">Outside the venue access hours. Change the time or remove this planned vendor.</p>}{service !== "venue" && venueSlot && validSchedule(venueSlot) && slot.date !== venueSlot.date && <p className="helper">Confirm venue access for this separate date.</p>}</>;
              })()}
          </li>;
        })}</ul>
      </dialog>
      <dialog ref={slotDialog} className="booking-dialog" aria-labelledby="slot-title">
        <div className="booking-heading"><div><p className="eyebrow">{eventName || "Name your event"} · {selectedTheme ?? "No theme chosen"}</p><h2 id="slot-title">{editing?.kind === "event" ? "Other event" : `Schedule ${editing?.name ?? "vendor"}`}</h2></div><button type="button" className="secondary-button" onClick={() => slotDialog.current?.close()}>Close</button></div>
        {editing?.kind === "event" && <label className="field">Event name <input value={draftName} maxLength={120} onChange={e => setDraftName(e.target.value)} /></label>}
        <div className="booking-fields"><label className="field">Date <input type="date" value={draftSlot.date} onChange={e => setDraftSlot(current => ({ ...current, date: e.target.value }))} /></label><label className="field">Start (24-hour; type four digits) <input type="text" inputMode="numeric" placeholder="1700" maxLength={5} value={draftSlot.start} onChange={e => setDraftSlot(current => ({ ...current, start: formatTimeEntry(e.target.value) }))} /></label><label className="field">End (24-hour; type four digits) <input type="text" inputMode="numeric" placeholder="1900" maxLength={5} value={draftSlot.end} onChange={e => setDraftSlot(current => ({ ...current, end: formatTimeEntry(e.target.value) }))} /></label></div>
        {slotError && <p className="booking-missing" role="alert">{slotError}</p>}
        {editing?.kind === "vendor" && (() => {
          const scheduled = (Object.entries(selections) as [Service, string | undefined][]).flatMap(([service, id]) => {
            if (service === "venue" || !id || id === editing.id) return [];
            const vendor = vendors.find(item => item.id === id);
            const slot = vendorSlots[id];
            return vendor && slot && validSchedule(slot) ? [{ service, vendor, slot }] : [];
          });
          return <div><h3>Other scheduled vendors for this event</h3>{scheduled.length ? <ul>{scheduled.map(({ service, vendor, slot }) => <li key={service}>{vendor.name}: {slot.date} · {slot.start}–{slot.end}</li>)}</ul> : <p>No other vendors scheduled for this event yet.</p>}</div>;
        })()}
        <div className="decision-row"><button type="button" className="primary-button" onClick={saveSlot}>Save time</button><button type="button" className="secondary-button" onClick={() => slotDialog.current?.close()}>Cancel</button></div>
      </dialog>
    </main>
  );
}
