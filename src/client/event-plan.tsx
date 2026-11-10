"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { sampleVendors, type Vendor } from "../lib/vendor-search";
import type { NamedSchedule, ScheduleSlot } from "../lib/schedule-conflicts";

export const serviceLabels = { venue: "Venue", catering: "Caterer", florist: "Florist", entertainment: "DJ / entertainment", bakery: "Bakery", av: "AV", photography: "Photographer", decorator: "Decorator" } as const;
export type Service = keyof typeof serviceLabels;

export type EventPlan = {
  name: string;
  themeId: string;
  selections: Partial<Record<Service, string>>;
  vendorSlots: Record<string, ScheduleSlot>;
  otherEvents: NamedSchedule[];
  eventDate: string;
  eventStart: string;
  eventEnd: string;
  eventGuests: string;
};

const emptyPlan: EventPlan = {
  name: "My spectacular event", themeId: "", selections: {}, vendorSlots: {}, otherEvents: [],
  eventDate: "", eventStart: "", eventEnd: "", eventGuests: "",
};

type PlanContextValue = {
  plan: EventPlan;
  setField: <K extends keyof EventPlan>(key: K) => Dispatch<SetStateAction<EventPlan[K]>>;
  resetPlan: () => void;
  vendors: Vendor[];
  directorySource: "sample" | "supabase";
  directoryWarning: string | null;
  directoryError: string | null;
};

const PlanContext = createContext<PlanContextValue | null>(null);
const storageKey = "event-horizon-plan-v1";
const safeSlot = (value: unknown): value is ScheduleSlot => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const slot = value as Record<string, unknown>;
  return typeof slot.date === "string" && typeof slot.start === "string" && typeof slot.end === "string";
};

export function EventPlanProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<EventPlan>(emptyPlan);
  const [hydrated, setHydrated] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>(sampleVendors);
  const [directorySource, setDirectorySource] = useState<"sample" | "supabase">("sample");
  const [directoryWarning, setDirectoryWarning] = useState<string | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const value: unknown = JSON.parse(saved);
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const item = value as Partial<EventPlan>;
          setPlan({
            ...emptyPlan,
            name: typeof item.name === "string" ? item.name.slice(0, 120) : emptyPlan.name,
            themeId: typeof item.themeId === "string" ? item.themeId : "",
            selections: item.selections && typeof item.selections === "object" && !Array.isArray(item.selections)
              ? Object.fromEntries(Object.entries(item.selections).filter(([key, id]) => key in serviceLabels && typeof id === "string" && id.length <= 80)) : {},
            vendorSlots: item.vendorSlots && typeof item.vendorSlots === "object" && !Array.isArray(item.vendorSlots)
              ? Object.fromEntries(Object.entries(item.vendorSlots).filter(([id, slot]) => id.length <= 80 && safeSlot(slot))) : {},
            otherEvents: Array.isArray(item.otherEvents) ? item.otherEvents.filter((entry): entry is NamedSchedule =>
              !!entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.name === "string" && safeSlot(entry.slot)).slice(0, 100) : [],
            eventDate: typeof item.eventDate === "string" ? item.eventDate : "",
            eventStart: typeof item.eventStart === "string" ? item.eventStart : "",
            eventEnd: typeof item.eventEnd === "string" ? item.eventEnd : "",
            eventGuests: typeof item.eventGuests === "string" ? item.eventGuests : "",
          });
        }
      }
    } catch { /* A damaged browser draft starts fresh. */ }
    setHydrated(true);
  }, []);

  useEffect(() => { if (hydrated) { try { sessionStorage.setItem(storageKey, JSON.stringify(plan)); } catch { /* Browser storage may be unavailable. */ } } }, [plan, hydrated]);
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
          setVendors(result.vendors); setDirectorySource("supabase"); setDirectoryWarning(result.warning ?? null);
        }
      })
      .catch(() => { if (active) setDirectoryError("Couldn’t load the Supabase directory. Showing fictional sample listings instead."); });
    return () => { active = false; };
  }, []);

  function setField<K extends keyof EventPlan>(key: K): Dispatch<SetStateAction<EventPlan[K]>> {
    return value => setPlan(current => ({
      ...current,
      [key]: typeof value === "function" ? (value as (previous: EventPlan[K]) => EventPlan[K])(current[key]) : value,
    }));
  }

  return <PlanContext.Provider value={{ plan, setField, resetPlan: () => setPlan(emptyPlan), vendors, directorySource, directoryWarning, directoryError }}>{children}</PlanContext.Provider>;
}

export function useEventPlan() {
  const value = useContext(PlanContext);
  if (!value) throw new Error("EventPlanProvider is missing.");
  return value;
}
