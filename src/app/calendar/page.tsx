"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { useEventPlan } from "../../client/event-plan";
import { validSchedule, type NamedSchedule, type ScheduleSlot } from "../../lib/schedule-conflicts";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const zone = "America/New_York";
const fromDate = (date: string) => DateTime.fromISO(date, { zone });
const today = () => DateTime.now().setZone(zone);

export default function CalendarPage() {
  const { plan, setField, vendors } = useEventPlan();
  const initial = plan.eventDate && fromDate(plan.eventDate).isValid ? fromDate(plan.eventDate) : today();
  const [month, setMonth] = useState(() => initial.startOf("month"));
  const [selectedDate, setSelectedDate] = useState(() => initial.toISODate() ?? "");
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
    const eventDay = fromDate(plan.eventDate);
    if (!eventDay.isValid || eventDay.toISODate() !== plan.eventDate) return;
    setMonth(eventDay.startOf("month"));
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

  const gridStart = month.startOf("month").minus({ days: month.weekday % 7 });
  const days = Array.from({ length: 42 }, (_, index) => gridStart.plus({ days: index }));
  const selectedEntries = entries.filter(item => item.slot.date === selectedDate);
  const runSheet = entries.filter(item => item.kind !== "other");

  function saveOther(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slot = { date: selectedDate, start, end };
    if (!name.trim() || !validSchedule(slot)) { setError("Enter a name and valid same-day start and end times in 24-hour format."); return; }
    const id = editingId ?? crypto.randomUUID();
    setField("otherEvents")(current => [...current.filter(item => item.id !== id), { id, name: name.trim().slice(0, 120), slot }]);
    setName(""); setStart("17:00"); setEnd("19:00"); setEditingId(null); setError(null);
  }
  function editOther(item: NamedSchedule) {
    setSelectedDate(item.slot.date); setMonth(fromDate(item.slot.date).startOf("month"));
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
    <header className="workspace-heading"><div><p className="eyebrow">The whole orbit</p><h1>Visual calendar</h1><p>See your events and vendor setup together. Your plan is saved on this device; use Save &amp; share to work with someone else.</p></div><Link className="primary-button" href="/vendors">Search &amp; add vendors →</Link></header>
    <div className="calendar-layout">
      <section className="calendar-panel" aria-label="Event calendar">
        <div className="calendar-toolbar"><h2>{month.toLocaleString({ month: "long", year: "numeric" })}</h2><div><button className="calendar-icon-button" type="button" aria-label="Previous month" onClick={() => setMonth(month.minus({ months: 1 }))}>←</button><button className="calendar-icon-button" type="button" onClick={() => { const current = today(); setMonth(current.startOf("month")); setSelectedDate(current.toISODate() ?? ""); }}>Today</button><button className="calendar-icon-button" type="button" aria-label="Next month" onClick={() => setMonth(month.plus({ months: 1 }))}>→</button></div></div>
        <div className="calendar-grid">{weekdays.map(day => <strong className="calendar-weekday" key={day}>{day}</strong>)}{days.map(day => { const key = day.toISODate() ?? ""; const items = entries.filter(item => item.slot.date === key); return <button type="button" key={key} className={`calendar-day ${day.month === month.month ? "" : "outside"} ${selectedDate === key ? "active" : ""}`} aria-label={`${key}, ${items.length} scheduled items`} aria-pressed={selectedDate === key} onClick={() => setSelectedDate(key)}><span>{day.day}</span><span className="calendar-day-items">{items.slice(0, 3).map(item => <small key={`${item.kind}-${item.id}`} className={`calendar-chip ${item.kind}`}>{item.slot.start} {item.name}</small>)}{items.length > 3 && <small className="calendar-more">+{items.length - 3} more</small>}</span></button>; })}</div>
      </section>
      <aside className="calendar-sidebar">
        <section className="panel"><p className="eyebrow">Selected date</p><h2>{fromDate(selectedDate).toLocaleString({ weekday: "long", month: "long", day: "numeric" })}</h2>{selectedEntries.length ? <ul className="agenda-list">{selectedEntries.map(item => <li key={`${item.kind}-${item.id}`}><span className={`agenda-dot ${item.kind}`} /><div><strong>{item.name}</strong><p>{item.slot.start}–{item.slot.end} · {item.kind === "vendor" ? "Vendor" : "Event"}</p>{item.kind === "other" && <div className="agenda-actions"><button type="button" onClick={() => editOther(item)}>Edit</button><button type="button" onClick={() => removeOther(item.id)}>Cancel event</button></div>}</div></li>)}</ul> : <p className="helper">Nothing planned for this date yet.</p>}</section>
        <section className="panel"><h2>{editingId ? "Edit event" : "Add an event"}</h2><form className="calendar-form" onSubmit={saveOther}><label>Event name<input value={name} maxLength={120} onChange={event => setName(event.target.value)} placeholder="A very good party" /></label><label>Date<input type="date" value={selectedDate} onChange={event => { if (!event.target.value) return; setSelectedDate(event.target.value); setMonth(fromDate(event.target.value).startOf("month")); }} /></label><div className="calendar-time-fields"><label>Start (24h)<input value={start} maxLength={5} placeholder="17:00" onChange={event => setStart(event.target.value)} /></label><label>End (24h)<input value={end} maxLength={5} placeholder="19:00" onChange={event => setEnd(event.target.value)} /></label></div>{error && <p className="alert" role="alert">{error}</p>}<button className="primary-button">{editingId ? "Save changes" : "Add to calendar"}</button>{editingId && <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setName(""); }}>Cancel editing</button>}</form></section>
        <section className="panel"><h2>{plan.eventDate ? "Your main event" : "Start your main event"}</h2><form className="calendar-form" onSubmit={savePrimary}><label>Event name<input value={primaryName} maxLength={120} onChange={event => setPrimaryName(event.target.value)} /></label><p className="helper">Choose its date above: {selectedDate}</p><div className="calendar-time-fields"><label>Starts<input value={primaryStart} maxLength={5} onChange={event => setPrimaryStart(event.target.value)} /></label><label>Ends<input value={primaryEnd} maxLength={5} onChange={event => setPrimaryEnd(event.target.value)} /></label></div>{primaryError && <p className="alert" role="alert">{primaryError}</p>}<button className="secondary-button">{plan.eventDate ? "Update main event" : "Create main event"}</button>{plan.eventDate && <button type="button" className="text-danger" onClick={removePrimary}>Cancel main event</button>}</form></section>
      </aside>
    </div>
    <section className="panel run-sheet"><div className="panel-header"><div><p className="eyebrow">Everything in time order</p><h2>Event run sheet</h2></div><Link href="/conflicts">Check timing →</Link></div>{runSheet.length ? <ol className="run-sheet-list">{runSheet.map(item => <li key={`${item.kind}-${item.id}`}><time dateTime={`${item.slot.date}T${item.slot.start}`}>{item.slot.date}<strong>{item.slot.start}–{item.slot.end}</strong></time><div><strong>{item.name}</strong><p>{item.kind === "event" ? "Main event" : "Vendor setup or service"}</p></div></li>)}</ol> : <p className="empty-state">Add an event and vendor times to build your run sheet.</p>}</section>
  </main>;
}
