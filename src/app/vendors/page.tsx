"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { capacityLabel, samplePrice, sampleVendors, searchVendors, type VendorCriteria, type Vendor } from "../../lib/vendor-search";

const example = "Find a caterer in Brooklyn for 80 guests under $3,000";
const categoryIcons: Record<string, string> = {
  catering: "🍴", bakery: "🥖", venue: "🏛️", AV: "🎛️", photography: "📷",
};

type Turn = { query: string; message: string; matches: Vendor[]; possibleMatches: Vendor[] };

export default function VendorFinder() {
  const [query, setQuery] = useState("");
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
          <p className="subtitle">Find caterers, bakeries, venues, AV providers, and photographers.</p>
          <p className="scope-note"><strong>Stretch feature</strong> · Separate from the core P0 demo. Recovery Engine is the first stretch priority.</p>
        </div>
        <span className="status-pill">{directorySource === "supabase" ? "Supabase directory" : "Sample directory"}</span>
      </header>
      <section className="panel" aria-labelledby="search-heading">
        <h2 id="search-heading">What do you need for your event?</h2>
        <p className="helper">{directorySource === "supabase"
          ? "Vendor details come from the connected directory. Confirm prices, ratings, and availability with each vendor."
          : "Sample vendors, contacts, prices, ratings, and reviews are fictional. Availability is unknown."}</p>
        {directoryError && <p className="alert" role="alert">{directoryError}</p>}
        {directoryWarning && <p className="alert" role="status">{directoryWarning}</p>}
        {directorySource === "supabase" && vendors.length === 0 && <p className="empty-state">No valid vendor listings are available yet. Add or correct records in Supabase.</p>}
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
                  <p className="helper">{vendor.isSynthetic ? "Sample price" : "Listed price"} {samplePrice(vendor)} · Capacity {capacityLabel(vendor)} · Availability unknown</p>
                  {(vendor.contactEmail || vendor.sourceUrl) && <p className="helper">{vendor.isSynthetic ? "Sample contact" : "Contact"} {vendor.contactEmail && <span className="vendor-contact">{vendor.contactEmail}</span>}{vendor.contactEmail && vendor.sourceUrl && " · "}{vendor.sourceUrl && <a href={vendor.sourceUrl} target="_blank" rel="noreferrer">Source</a>}</p>}
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
    </main>
  );
}
