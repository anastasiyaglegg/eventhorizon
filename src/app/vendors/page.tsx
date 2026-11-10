"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { evaluateSchedule, scheduleReviewResponseSchema, type ScheduleIssue, type ScheduleReviewResponse } from "../../lib/schedule-rules";
import { findScheduleOverlaps, validSchedule, type NamedSchedule } from "../../lib/schedule-conflicts";
import { capacityLabel, samplePrice, sampleVendors, searchVendors, searchVendorNames, type VendorCriteria, type Vendor } from "../../lib/vendor-search";

const example = "Find a caterer in Brooklyn for 80 guests under $3,000";
const categoryIcons: Record<string, string> = {
  catering: "🍴", bakery: "🥖", venue: "🏛️", av: "🎛️", photography: "📷", florist: "🌸", decorator: "🎈", entertainment: "🎵",
};

const serviceLabels = { venue: "Venue", catering: "Caterer", florist: "Florist", entertainment: "DJ / entertainment", bakery: "Bakery", av: "AV", photography: "Photographer", decorator: "Decorator" } as const;
type Service = keyof typeof serviceLabels;
type Selections = Partial<Record<Service, string>>;
type VendorSlot = { date: string; start: string; end: string };

type Turn = { query: string; message: string; matches: Vendor[]; possibleMatches: Vendor[] };

export default function VendorFinder() {
  const [query, setQuery] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [selections, setSelections] = useState<Selections>({});
  const [vendorSlots, setVendorSlots] = useState<Record<string, VendorSlot>>({});
  const [otherEvents, setOtherEvents] = useState<NamedSchedule[]>([]);
  const [editing, setEditing] = useState<{ kind: "vendor" | "event"; id: string; name: string } | null>(null);
  const [draftSlot, setDraftSlot] = useState<VendorSlot>({ date: "", start: "", end: "" });
  const [draftName, setDraftName] = useState("");
  const [eventGuests, setEventGuests] = useState("");
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
  }
  const [eventDate, setEventDate] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
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
      return vendor ? [{ id: vendor.id, name: vendor.name, category: service, slot: vendorSlots[vendor.id] ?? null }] : [];
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
      if (!parsed.success) throw new Error("The agent report had an invalid format.");
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
  const [vendors, setVendors] = useState<Vendor[]>(sampleVendors);
  const [directorySource, setDirectorySource] = useState<"sample" | "supabase">("sample");
  const [directoryWarning, setDirectoryWarning] = useState<string | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/vendors")
      .then(async response => {
        if (!response.ok) throw new Error("Vendor lookup is unavailable");
        return response.json() as Promise<{ source: "sample" | "supabase"; vendors: Vendor[]; warning?: string }>;
      })
      .then(result => {
        if (!active) return;
        if (result.source === "supabase" && Array.isArray(result.vendors)) {
          setVendors(result.vendors);
          setDirectorySource("supabase");
          setDirectoryWarning(result.warning ?? null);
        }
      })
      .catch(() => {
        if (active) setDirectoryError("Couldn’t load the Supabase directory. Showing fictional sample listings instead.");
      });
    return () => { active = false; };
  }, []);

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
      <Link href="/">← Event review</Link>
      <header className="page-heading vendor-finder-heading">
        <div>
          <p className="eyebrow">Event Horizon</p>
          <h1>Vendor finder</h1>
          <p className="subtitle">Find caterers, bakeries, florists, venues, AV providers, photographers, decorators, and entertainment.</p>
          <p className="scope-note"><strong>Stretch feature</strong> · Separate from the core P0 demo. Recovery Engine is the first stretch priority.</p>
        </div>
        <span className="status-pill">{directorySource === "supabase" ? "Supabase directory" : "Sample directory"}</span>
      </header>
      <section className="panel planned-summary" aria-labelledby="planned-title">
        <h2 id="planned-title">Your event plan</h2>
        <p className="helper">Your selections are kept for this session. Contact each vendor to confirm a reservation.</p>
        <div className="booking-fields"><label className="field">Event date <input type="date" value={eventDate} onChange={e => { clearCheck(); setEventDate(e.target.value); }} /></label><label className="field">Event start (24-hour HH:MM) <input value={eventStart} placeholder="18:00" maxLength={5} onChange={e => { clearCheck(); setEventStart(e.target.value); }} /></label><label className="field">Event end (24-hour HH:MM) <input value={eventEnd} placeholder="20:00" maxLength={5} onChange={e => { clearCheck(); setEventEnd(e.target.value); }} /></label><label className="field">Planned number of guests <input type="number" min="1" step="1" value={eventGuests} onChange={e => setEventGuests(e.target.value)} /></label></div>
        {!selections.venue && <p className="booking-missing">Venue not selected</p>}
        <ul className="planned-list">{(Object.entries(serviceLabels) as [Service, string][]).map(([service, label]) => {
          const vendor = vendors.find(v => v.id === selections[service]);
          if (!vendor) return null;
          const slot = vendorSlots[vendor.id];
          const scheduled = !!slot && validSchedule(slot);
          const others = service === "venue" ? [] : (Object.entries(selections) as [Service, string | undefined][]).filter(([key, id]) => key !== "venue" && id && id !== vendor.id).flatMap(([, id]) => { const other = vendors.find(v => v.id === id); const otherSlot = id ? vendorSlots[id] : undefined; return other && otherSlot ? [{ id: other.id, name: other.name, slot: otherSlot }] : []; });
          const overlaps = slot ? findScheduleOverlaps({ id: vendor.id, name: vendor.name, slot }, [...others, ...otherEvents]) : [];
          const venueSlot = selections.venue ? vendorSlots[selections.venue] : undefined;
          const outsideVenue = service !== "venue" && !!slot && !!venueSlot && validSchedule(slot) && validSchedule(venueSlot) && (slot.date === venueSlot.date && (slot.start < venueSlot.start || slot.end > venueSlot.end));
          return <li className="planned-item" key={service}><div><strong>{label}: {vendor.name}</strong><p>{scheduled && slot ? `${slot.date} · ${slot.start}–${slot.end}` : <span className="booking-missing">Date and time not set</span>}{service === "venue" && (eventGuests ? ` · ${eventGuests} planned guests` : <span className="booking-missing"> · Guest count not set</span>)}</p>{overlaps.length > 0 && <p className="booking-conflict">Overlaps with {overlaps.map(item => item.name).join(", ")}; review whether this is a problem.</p>}{outsideVenue && <p className="booking-conflict">Outside the venue access hours.</p>}{service !== "venue" && slot && venueSlot && validSchedule(slot) && validSchedule(venueSlot) && slot.date !== venueSlot.date && <p className="helper">Confirm venue access for this separate date.</p>}</div><div className="decision-row"><button type="button" className="secondary-button" onClick={() => openSlot("vendor", vendor.id, vendor.name, slot)}>Change date and time</button><button type="button" className="secondary-button" onClick={() => removeVendor(service, vendor.id)}>Remove</button></div></li>;
        })}</ul>
      </section>
      <section className="panel" aria-labelledby="search-heading">
        <h2 id="search-heading">What do you need for your event?</h2>
        <p className="helper">{directorySource === "supabase"
          ? "Vendor details come from the connected directory. Prices, capacity, and availability marked demo are fictional. Confirm real details with each vendor."
          : "Sample vendors, contacts, prices, ratings, and reviews are fictional. Availability is unknown."}</p>
        {directoryError && <p className="alert" role="alert">{directoryError}</p>}
        {directoryWarning && <p className="alert" role="status">{directoryWarning}</p>}
        {directorySource === "supabase" && vendors.length === 0 && <p className="empty-state">No valid vendor listings are available yet. Add or correct records in Supabase.</p>}
        <h3>Browse by category</h3>
        <div className="vendor-categories" aria-label="Vendor categories">{(Object.entries(serviceLabels) as [Service, string][]).map(([service, label]) => <button className="secondary-button" type="button" key={service} onClick={() => browseCategory(service)}><span aria-hidden="true">{categoryIcons[service]}</span> {label}</button>)}</div>
        <form className="vendor-name-search" onSubmit={searchByName} aria-label="Find a vendor by name">
          <label className="field">Find a specific vendor
            <input value={nameQuery} onChange={event => setNameQuery(event.target.value)} placeholder="Type a business name, e.g. Buds of Brooklyn" maxLength={200} />
          </label>
          <button className="primary-button" disabled={nameQuery.trim().length < 2}>Search by name</button>
        </form>
        <button className="secondary-button" type="button" onClick={() => openPlanner()}>View booking plan</button>
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
                  <button className="secondary-button" type="button" onClick={() => openPlanner(vendor)}>Book {vendor.name}</button>
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
        <div className="booking-heading"><h2 id="booking-title">Event booking plan</h2><button type="button" className="secondary-button" onClick={() => dialogRef.current?.close()}>Close</button></div>
        <p className="helper">Plan selections for this session. These are not confirmed bookings; contact each business to reserve.</p>
        <p>Venue: {vendors.find(v => v.id === selections.venue)?.name ?? <span className="booking-missing">Missing venue</span>}</p>
        <ul className="booking-list">{(Object.entries(serviceLabels) as [Service, string][]).map(([service, label]) => {
          const selected = vendors.find(v => v.id === selections[service]);
          const slot = selected ? vendorSlots[selected.id] : undefined;
          const slotValid = !!slot && validTime(slot.start) && validTime(slot.end) && slot.start < slot.end;
          return <li key={service} className="booking-row"><label>{label}
            <select value={selections[service] ?? ""} onChange={event => { clearCheck(); setSelections(current => ({ ...current, [service]: event.target.value || undefined })); }}>
              <option value="">Choose {label.toLowerCase()}</option>
              {vendors.filter(v => v.service === service).map(v => <option key={v.id} value={v.id}>{v.name} · {v.borough}</option>)}
            </select></label>
            {selected ? <>
              <span>Selected: {selected.name} {selected.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Visit website</a>}</span>
              <p>{slotValid && slot?.date ? `${slot.date} · ${slot.start}–${slot.end}` : <span className="booking-missing">Missing date or time</span>}</p>
              <div className="decision-row"><button className="secondary-button" type="button" onClick={() => openSlot("vendor", selected.id, selected.name, slot)}> {slotValid && slot?.date ? "Change date and time" : "Choose date and time"}</button><button className="secondary-button" type="button" onClick={() => removeVendor(service, selected.id)}>Remove planned {label.toLowerCase()}</button></div>
              {slot && (() => {
                const otherVendors = service === "venue" ? [] : (Object.entries(selections) as [Service, string | undefined][]).filter(([key, id]) => key !== "venue" && id && id !== selected.id).flatMap(([, id]) => { const item = vendors.find(v => v.id === id); const itemSlot = id ? vendorSlots[id] : undefined; return item && itemSlot ? [{ id: item.id, name: item.name, slot: itemSlot }] : []; });
                const overlaps = findScheduleOverlaps({ id: selected.id, name: selected.name, slot }, [...otherVendors, ...otherEvents]);
                const venueSlot = selections.venue ? vendorSlots[selections.venue] : undefined;
                const outsideVenue = service !== "venue" && !!venueSlot && validSchedule(venueSlot) && validSchedule(slot) && (slot.date === venueSlot.date && (slot.start < venueSlot.start || slot.end > venueSlot.end));
                return <>{overlaps.length > 0 && <p className="booking-conflict" role="status">Overlaps with {overlaps.map(item => item.name).join(", ")}. Review whether the overlap is a problem.</p>}{outsideVenue && <p className="booking-conflict" role="status">Outside the venue access hours. Change the time or remove this planned vendor.</p>}{service !== "venue" && venueSlot && validSchedule(venueSlot) && validSchedule(slot) && slot.date !== venueSlot.date && <p className="helper">Confirm venue access for this separate date.</p>}</>;
              })()}
            </> : <span className="booking-missing">Missing {label.toLowerCase()}</span>}
          </li>;
        })}</ul>
        <section aria-labelledby="other-events-title"><h3 id="other-events-title">Other events to check</h3><p className="helper">Add other events here to check overlaps. Only events entered in this session can be checked.</p>
          <button type="button" className="secondary-button" onClick={() => openSlot("event", crypto.randomUUID(), "")}>Add another event</button>
          {otherEvents.map(event => <div key={event.id} className="booking-row"><p>{event.name}: {event.slot.date} · {event.slot.start}–{event.slot.end}</p>{findScheduleOverlaps(event, otherEvents).length > 0 && <p className="booking-conflict" role="status">Overlaps with {findScheduleOverlaps(event, otherEvents).map(item => item.name).join(", ")}. Review whether the overlap is a problem.</p>}<div className="decision-row"><button type="button" className="secondary-button" onClick={() => openSlot("event", event.id, event.name, event.slot)}>Change event</button><button type="button" className="secondary-button" onClick={() => { clearCheck(); setOtherEvents(current => current.filter(item => item.id !== event.id)); }}>Remove event</button></div></div>)}
        </section>
        <section aria-labelledby="agent-check-title">
          <h3 id="agent-check-title">Check vendor schedules</h3>
          <p className="helper">Planning checks the event times and every selected vendor against your timing rules. Recovery suggests next steps for any issues. Times use New York time; event and vendor time slots must each start and end on the same day.</p>
          <button type="button" className="secondary-button" disabled={checkBusy} onClick={checkVendor}>{checkBusy ? "Agents checking…" : "Check schedules with agents"}</button>
          {checkError && <p className="booking-missing" role="alert">{checkError}</p>}
          {ruleIssues && <div role="status"><h4>Schedule findings</h4>{ruleIssues.length ? <ul>{ruleIssues.map(issue => <li key={issue.id} className="booking-missing">{issue.message}{checkReport && <> <strong>({checkReport.findings.find(f => f.issue_id === issue.id)?.priority ?? "normal"} priority)</strong> {checkReport.suggestions.find(item => item.issue_id === issue.id)?.text}</>}</li>)}</ul> : <p>No issues found under the timing rules.</p>}{checkReport && <p className="helper">Planning reviewed the findings{checkReport.issues.length ? " and Recovery prepared suggested next steps" : ""}. Review and confirm any changes yourself.</p>}</div>}
        </section>
      </dialog>
      <dialog ref={slotDialog} className="booking-dialog" aria-labelledby="slot-title">
        <div className="booking-heading"><h2 id="slot-title">{editing?.kind === "event" ? "Other event" : `Schedule ${editing?.name ?? "vendor"}`}</h2><button type="button" className="secondary-button" onClick={() => slotDialog.current?.close()}>Close</button></div>
        {editing?.kind === "event" && <label className="field">Event name <input value={draftName} maxLength={120} onChange={e => setDraftName(e.target.value)} /></label>}
        <div className="booking-fields"><label className="field">Date <input type="date" value={draftSlot.date} onChange={e => setDraftSlot(current => ({ ...current, date: e.target.value }))} /></label><label className="field">Start (24-hour HH:MM) <input type="text" inputMode="numeric" placeholder="17:00" maxLength={5} value={draftSlot.start} onChange={e => setDraftSlot(current => ({ ...current, start: e.target.value }))} /></label><label className="field">End (24-hour HH:MM) <input type="text" inputMode="numeric" placeholder="19:00" maxLength={5} value={draftSlot.end} onChange={e => setDraftSlot(current => ({ ...current, end: e.target.value }))} /></label></div>
        {slotError && <p className="booking-missing" role="alert">{slotError}</p>}
        {editing?.kind === "vendor" && <div><h3>Other planned vendors</h3><ul>{(Object.entries(selections) as [Service, string | undefined][]).filter(([, id]) => id && id !== editing.id).map(([service, id]) => { const vendor = vendors.find(v => v.id === id); const slot = id ? vendorSlots[id] : undefined; return vendor ? <li key={service}>{vendor.name}: {slot && validSchedule(slot) ? `${slot.date} · ${slot.start}–${slot.end}` : "time not set"}</li> : null; })}</ul></div>}
        <div className="decision-row"><button type="button" className="primary-button" onClick={saveSlot}>Save time</button><button type="button" className="secondary-button" onClick={() => slotDialog.current?.close()}>Cancel</button></div>
      </dialog>
    </main>
  );
}
