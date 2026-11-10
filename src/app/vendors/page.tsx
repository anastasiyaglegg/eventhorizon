"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { capacityLabel, samplePrice, sampleVendors, searchVendors, type VendorCriteria, type Vendor } from "../../lib/vendor-search";

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
  const [selections, setSelections] = useState<Selections>({});
  const [vendorSlots, setVendorSlots] = useState<Record<string, VendorSlot>>({});
  function updateSlot(id: string, field: keyof VendorSlot, value: string) {
    setVendorSlots(current => ({ ...current, [id]: { ...(current[id] ?? { date: "", start: "", end: "" }), [field]: value } }));
  }
  const dialogRef = useRef<HTMLDialogElement>(null);
  const validTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  function openPlanner(vendor?: Vendor) {
    if (vendor && Object.hasOwn(serviceLabels, vendor.service)) {
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
    setQuery("");
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
      <section className="panel" aria-labelledby="search-heading">
        <h2 id="search-heading">What do you need for your event?</h2>
        <p className="helper">{directorySource === "supabase"
          ? "Vendor details come from the connected directory. Prices, capacity, and availability marked demo are fictional. Confirm real details with each vendor."
          : "Sample vendors, contacts, prices, ratings, and reviews are fictional. Availability is unknown."}</p>
        {directoryError && <p className="alert" role="alert">{directoryError}</p>}
        {directoryWarning && <p className="alert" role="status">{directoryWarning}</p>}
        {directorySource === "supabase" && vendors.length === 0 && <p className="empty-state">No valid vendor listings are available yet. Add or correct records in Supabase.</p>}
        <button className="secondary-button" type="button" onClick={() => openPlanner()}>View booking plan</button>
        <button className="secondary-button vendor-example" type="button" onClick={() => search(example)}>
          {example}
        </button>
        <div role="log" aria-label="Vendor search conversation">
          {turns.map((turn, index) => (
            <div className="vendor-turn" key={index}>
              <p><strong>You:</strong> {turn.query}</p>
              <p><strong>Vendor finder:</strong> {turn.message}</p>
              {[...turn.matches.map(vendor => ({ vendor, possible: false })), ...turn.possibleMatches.map(vendor => ({ vendor, possible: true }))].length > 0 && <ul className="vendor-results">
                {[...turn.matches.map(vendor => ({ vendor, possible: false })), ...turn.possibleMatches.map(vendor => ({ vendor, possible: true }))].map(({ vendor, possible }) => <li className="fact" key={vendor.id}>
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
              onClick={() => { setTurns([]); setCriteria({}); setQuery(""); }}>New search</button>
          </div>
        </form>
      </section>
      <dialog ref={dialogRef} className="booking-dialog" aria-labelledby="booking-title">
        <div className="booking-heading"><h2 id="booking-title">Event booking plan</h2><button type="button" className="secondary-button" onClick={() => dialogRef.current?.close()}>Close</button></div>
        <p className="helper">Plan selections for this session. These are not confirmed bookings; contact each business to reserve.</p>
        <p>Venue: {vendors.find(v => v.id === selections.venue)?.name ?? <span className="booking-missing">Missing venue</span>}</p>
        <ul className="booking-list">{(Object.entries(serviceLabels) as [Service, string][]).map(([service, label]) => {
          const selected = vendors.find(v => v.id === selections[service]);
          const slot = selected ? vendorSlots[selected.id] : undefined;
          const slotValid = !!slot && validTime(slot.start) && validTime(slot.end) && slot.start < slot.end;
          return <li key={service} className="booking-row"><label>{label}
            <select value={selections[service] ?? ""} onChange={event => setSelections(current => ({ ...current, [service]: event.target.value || undefined }))}>
              <option value="">Choose {label.toLowerCase()}</option>
              {vendors.filter(v => v.service === service).map(v => <option key={v.id} value={v.id}>{v.name} · {v.borough}</option>)}
            </select></label>
            {selected ? <>
              <span>Selected: {selected.name} {selected.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Visit website</a>}</span>
              <div className="booking-fields">
                <label className="field">{label} date <input type="date" value={slot?.date ?? ""} onChange={event => updateSlot(selected.id, "date", event.target.value)} /></label>
                <label className="field">{label} start (24-hour HH:MM) <input type="text" inputMode="numeric" placeholder="17:00" maxLength={5} value={slot?.start ?? ""} onChange={event => updateSlot(selected.id, "start", event.target.value)} /></label>
                <label className="field">{label} end (24-hour HH:MM) <input type="text" inputMode="numeric" placeholder="19:00" maxLength={5} value={slot?.end ?? ""} onChange={event => updateSlot(selected.id, "end", event.target.value)} /></label>
              </div>
              {!slot?.date && <span className="booking-missing">Missing date for {selected.name}</span>}
              {!slotValid && <span className="booking-missing">Missing or invalid time for {selected.name}: enter a same-day 24-hour slot with the end after the start.</span>}
            </> : <span className="booking-missing">Missing {label.toLowerCase()}</span>}
          </li>;
        })}</ul>
      </dialog>
    </main>
  );
}
