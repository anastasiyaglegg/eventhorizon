"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useEventPlan } from "../../client/event-plan";
import { validSchedule, type NamedSchedule, type ScheduleSlot } from "../../lib/schedule-conflicts";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export default function CalendarPage() {
  const { plan, setField, vendors } = useEventPlan();
  const initial = plan.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(plan.eventDate) ? new Date(`${plan.eventDate}T12:00:00`) : new Date();
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(initial));
  const [name, setName] = useState("");
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("19:00");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [primaryName, setPrimaryName] = useState(plan.name);
  const [primaryStart, setPrimaryStart] = useState(plan.eventStart || "18:00");
  const [primaryEnd, setPrimaryEnd] = useState(plan.eventEnd || "20:00");
  const [primaryError, setPrimaryError] = useState<string | null>(null);
  useEffect(() => {
    setPrimaryName(plan.name);
    setPrimaryStart(plan.eventStart || "18:00");
    setPrimaryEnd(plan.eventEnd || "20:00");
  }, [plan.name, plan.eventStart, plan.eventEnd]);
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.eventDate)) return;
    const eventDay = new Date(`${plan.eventDate}T12:00:00`);
    if (Number.isNaN(eventDay.getTime())) return;
    setMonth(new Date(eventDay.getFullYear(), eventDay.getMonth(), 1));
    setSelectedDate(plan.eventDate);
  }, [plan.eventDate]);

  const entries = useMemo(() => {
    const result: { id: string; name: string; kind: "event" | "vendor" | "other"; slot: ScheduleSlot }[] = [];
    if (validSchedule({ date: plan.eventDate, start: plan.eventStart, end: plan.eventEnd })) result.push({ id: "main-event", name: plan.name, kind: "event", slot: { date: plan.eventDate, start: plan.eventStart, end: plan.eventEnd } });
    for (const id of Object.values(plan.selections)) {
      if (!id || !plan.vendorSlots[id] || !validSchedule(plan.vendorSlots[id])) continue;
      const vendor = vendors.find(item => item.id === id);
      result.push({ id, name: vendor?.name ?? "Selected vendor", kind: "vendor", slot: plan.vendorSlots[id] });
    }
    for (const event of plan.otherEvents) if (validSchedule(event.slot)) result.push({ id: event.id, name: event.name, kind: "other", slot: event.slot });
    return result.sort((a, b) => a.slot.date.localeCompare(b.slot.date) || a.slot.start.localeCompare(b.slot.start));
  }, [plan, vendors]);

  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - new Date(month.getFullYear(), month.getMonth(), 1).getDay());
  const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  const selectedEntries = entries.filter(item => item.slot.date === selectedDate);

  function saveOther(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slot = { date: selectedDate, start, end };
    if (!name.trim() || !validSchedule(slot)) { setError("Enter a name and valid same-day start and end times in 24-hour format."); return; }
    const id = editingId ?? crypto.randomUUID();
    setField("otherEvents")(current => [...current.filter(item => item.id !== id), { id, name: name.trim().slice(0, 120), slot }]);
    setName(""); setStart("17:00"); setEnd("19:00"); setEditingId(null); setError(null);
  }
  function editOther(item: NamedSchedule) {
    setSelectedDate(item.slot.date); setMonth(new Date(`${item.slot.date}T12:00:00`));
    setEditingId(item.id); setName(item.name); setStart(item.slot.start); setEnd(item.slot.end); setError(null);
  }
  function removeOther(id: string) {
    if (!window.confirm("Remove this event from your local calendar?")) return;
    setField("otherEvents")(current => current.filter(item => item.id !== id));
    if (editingId === id) { setEditingId(null); setName(""); }
  }
  function savePrimary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slot = { date: selectedDate, start: primaryStart, end: primaryEnd };
    if (!primaryName.trim() || !validSchedule(slot)) { setPrimaryError("Enter an event name and valid same-day times."); return; }
    setField("name")(primaryName.trim().slice(0, 120)); setField("eventDate")(slot.date); setField("eventStart")(slot.start); setField("eventEnd")(slot.end); setPrimaryError(null);
  }
  function removePrimary() {
    if (!window.confirm("Remove this event and its vendor selections from this session?")) return;
    setField("eventDate")(""); setField("eventStart")(""); setField("eventEnd")("");
    setField("selections")({}); setField("vendorSlots")({});
  }

  return <main className="page-shell workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">The whole orbit</p><h1>Visual calendar</h1><p>See events and vendor setup on the dates they happen. This calendar is saved only in this browser session.</p></div><Link className="primary-button" href="/vendors">Search &amp; add vendors →</Link></header>
    <div className="calendar-layout">
      <section className="calendar-panel" aria-label="Event calendar">
        <div className="calendar-toolbar"><h2>{month.toLocaleString("en-US", { month: "long", year: "numeric" })}</h2><div><button className="calendar-icon-button" type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button><button className="calendar-icon-button" type="button" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(dateKey(today)); }}>Today</button><button className="calendar-icon-button" type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button></div></div>
        <div className="calendar-grid">{weekdays.map(day => <strong className="calendar-weekday" key={day}>{day}</strong>)}{days.map(day => { const key = dateKey(day); const items = entries.filter(item => item.slot.date === key); return <button type="button" key={key} className={`calendar-day ${day.getMonth() === month.getMonth() ? "" : "outside"} ${selectedDate === key ? "active" : ""}`} aria-label={`${key}, ${items.length} scheduled items`} aria-pressed={selectedDate === key} onClick={() => setSelectedDate(key)}><span>{day.getDate()}</span><span className="calendar-day-items">{items.slice(0, 3).map(item => <small key={`${item.kind}-${item.id}`} className={`calendar-chip ${item.kind}`}>{item.slot.start} {item.name}</small>)}{items.length > 3 && <small className="calendar-more">+{items.length - 3} more</small>}</span></button>; })}</div>
      </section>
      <aside className="calendar-sidebar">
        <section className="panel"><p className="eyebrow">Selected date</p><h2>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h2>{selectedEntries.length ? <ul className="agenda-list">{selectedEntries.map(item => <li key={`${item.kind}-${item.id}`}><span className={`agenda-dot ${item.kind}`} /><div><strong>{item.name}</strong><p>{item.slot.start}–{item.slot.end} · {item.kind === "vendor" ? "Vendor" : "Event"}</p>{item.kind === "other" && <div className="agenda-actions"><button type="button" onClick={() => editOther(item)}>Edit</button><button type="button" onClick={() => removeOther(item.id)}>Cancel event</button></div>}</div></li>)}</ul> : <p className="helper">Nothing planned for this date yet.</p>}</section>
        <section className="panel"><h2>{editingId ? "Edit event" : "Add an event"}</h2><form className="calendar-form" onSubmit={saveOther}><label>Event name<input value={name} maxLength={120} onChange={event => setName(event.target.value)} placeholder="A very good party" /></label><label>Date<input type="date" value={selectedDate} onChange={event => { if (!event.target.value) return; setSelectedDate(event.target.value); setMonth(new Date(`${event.target.value}T12:00:00`)); }} /></label><div className="calendar-time-fields"><label>Start (24h)<input value={start} maxLength={5} placeholder="17:00" onChange={event => setStart(event.target.value)} /></label><label>End (24h)<input value={end} maxLength={5} placeholder="19:00" onChange={event => setEnd(event.target.value)} /></label></div>{error && <p className="alert" role="alert">{error}</p>}<button className="primary-button">{editingId ? "Save changes" : "Add to calendar"}</button>{editingId && <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setName(""); }}>Cancel editing</button>}</form></section>
        <section className="panel"><h2>{plan.eventDate ? "Your main event" : "Start your main event"}</h2><form className="calendar-form" onSubmit={savePrimary}><label>Event name<input value={primaryName} maxLength={120} onChange={event => setPrimaryName(event.target.value)} /></label><p className="helper">Choose its date above: {selectedDate}</p><div className="calendar-time-fields"><label>Starts<input value={primaryStart} maxLength={5} onChange={event => setPrimaryStart(event.target.value)} /></label><label>Ends<input value={primaryEnd} maxLength={5} onChange={event => setPrimaryEnd(event.target.value)} /></label></div>{primaryError && <p className="alert" role="alert">{primaryError}</p>}<button className="secondary-button">{plan.eventDate ? "Update main event" : "Create main event"}</button>{plan.eventDate && <button type="button" className="text-danger" onClick={removePrimary}>Cancel main event</button>}</form></section>
      </aside>
    </div>
  </main>;
}
