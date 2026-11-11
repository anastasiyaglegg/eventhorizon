"use client";

import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { sampleVendors, type Vendor } from "../lib/vendor-search";
import type { NamedSchedule, ScheduleSlot } from "../lib/schedule-conflicts";
import { eventPlanSchema, type EventPlanData } from "../lib/plan-contract";

export const serviceLabels = { venue: "Venue", catering: "Caterer", florist: "Florist", entertainment: "DJ / entertainment", bakery: "Bakery", av: "AV", photography: "Photographer", decorator: "Decorator" } as const;
export type Service = keyof typeof serviceLabels;

export type EventPlan = EventPlanData;

const emptyPlan: EventPlan = {
  name: "My spectacular event", themeId: "", selections: {}, vendorSlots: {}, otherEvents: [],
  vendorStatuses: {}, vendorEstimates: {}, categoryBudgets: {}, budgetLimit: "",
  eventDate: "", eventStart: "", eventEnd: "", eventGuests: "",
};

type SharedPlan = { id: string; token: string; version: number };
type ShareResult = { link: string; live: boolean };

type PlanContextValue = {
  plan: EventPlan;
  setField: <K extends keyof EventPlan>(key: K) => Dispatch<SetStateAction<EventPlan[K]>>;
  resetPlan: () => void;
  shared: boolean;
  unsavedChanges: boolean;
  sharedLoadError: string | null;
  saveAndShare: () => Promise<ShareResult>;
  refreshShared: () => Promise<void>;
  vendors: Vendor[];
  directoryReady: boolean;
  directorySource: "sample" | "supabase";
  directoryWarning: string | null;
  directoryError: string | null;
};

const PlanContext = createContext<PlanContextValue | null>(null);
const storageKey = "event-horizon-plan-v2";
const oldStorageKey = "event-horizon-plan-v1";
const sharedStorageKey = "event-horizon-shared-plan-v1";
const dirtySharedKey = "event-horizon-shared-dirty-v1";
const safeSlot = (value: unknown): value is ScheduleSlot => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const slot = value as Record<string, unknown>;
  return typeof slot.date === "string" && typeof slot.start === "string" && typeof slot.end === "string";
};

const draftKeyFor = (sharedId: string) => `${storageKey}:shared:${sharedId}`;

/** Rebuild a stored draft field by field so damaged or outdated values cannot break the plan. */
function sanitizeDraft(value: unknown): EventPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<EventPlan>;
  return {
    ...emptyPlan,
    name: typeof item.name === "string" ? item.name.slice(0, 120) : emptyPlan.name,
    themeId: typeof item.themeId === "string" ? item.themeId : "",
    selections: item.selections && typeof item.selections === "object" && !Array.isArray(item.selections)
      ? Object.fromEntries(Object.entries(item.selections).filter(([key, id]) => key in serviceLabels && typeof id === "string" && id.length <= 80)) : {},
    vendorSlots: item.vendorSlots && typeof item.vendorSlots === "object" && !Array.isArray(item.vendorSlots)
      ? Object.fromEntries(Object.entries(item.vendorSlots).filter(([id, slot]) => id.length <= 80 && safeSlot(slot))) : {},
    vendorStatuses: item.vendorStatuses && typeof item.vendorStatuses === "object" && !Array.isArray(item.vendorStatuses)
      ? Object.fromEntries(Object.entries(item.vendorStatuses).filter(([id, status]) => id.length <= 80 && ["considering", "contacted", "confirmed"].includes(String(status)))) as EventPlan["vendorStatuses"] : {},
    vendorEstimates: item.vendorEstimates && typeof item.vendorEstimates === "object" && !Array.isArray(item.vendorEstimates)
      ? Object.fromEntries(Object.entries(item.vendorEstimates).filter(([id, estimate]) => id.length <= 80 && typeof estimate === "string" && /^$|^\d{1,8}(?:\.\d{1,2})?$/.test(estimate))) : {},
    categoryBudgets: item.categoryBudgets && typeof item.categoryBudgets === "object" && !Array.isArray(item.categoryBudgets)
      ? Object.fromEntries(Object.entries(item.categoryBudgets).filter(([service, amount]) => service in serviceLabels && typeof amount === "string" && /^$|^\d{1,8}(?:\.\d{1,2})?$/.test(amount))) : {},
    budgetLimit: typeof item.budgetLimit === "string" && /^$|^\d{1,9}(?:\.\d{1,2})?$/.test(item.budgetLimit) ? item.budgetLimit : "",
    otherEvents: Array.isArray(item.otherEvents) ? item.otherEvents.filter((entry): entry is NamedSchedule =>
      !!entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.name === "string" && safeSlot(entry.slot)).slice(0, 100) : [],
    eventDate: typeof item.eventDate === "string" ? item.eventDate : "",
    eventStart: typeof item.eventStart === "string" ? item.eventStart : "",
    eventEnd: typeof item.eventEnd === "string" ? item.eventEnd : "",
    eventGuests: typeof item.eventGuests === "string" ? item.eventGuests : "",
  };
}

export function EventPlanProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<EventPlan>(emptyPlan);
  const [hydrated, setHydrated] = useState(false);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [shared, setShared] = useState<SharedPlan | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [sharedLoadError, setSharedLoadError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>(sampleVendors);
  const [directoryReady, setDirectoryReady] = useState(false);
  const [directorySource, setDirectorySource] = useState<"sample" | "supabase">("sample");
  const [directoryWarning, setDirectoryWarning] = useState<string | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const editedDuringLoad = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    let id = params.get("plan"); let token = hash.get("key");
    if (!hash.has("copy") && (!id || !token)) {
      try {
        const remembered = JSON.parse(sessionStorage.getItem(sharedStorageKey) ?? "null") as SharedPlan | null;
        if (remembered && typeof remembered.id === "string" && typeof remembered.token === "string") {
          id = remembered.id; token = remembered.token;
        }
      } catch { /* An invalid remembered link is ignored. */ }
    }
    const sharedLink = id && token ? { id, token } : null;
    let dirty: { id?: string; version?: number } | null = null;
    try { dirty = JSON.parse(sessionStorage.getItem(dirtySharedKey) ?? "null") as { id?: string; version?: number } | null; } catch { /* Ignore a damaged marker. */ }

    // Each shared plan keeps its own draft, separate from the unshared local draft, so opening a link
    // or working in another tab can never overwrite a different plan.
    const key = sharedLink ? draftKeyFor(sharedLink.id) : storageKey;
    let draft: EventPlan | null = null;
    try {
      const legacy = sharedLink ? null : sessionStorage.getItem(oldStorageKey);
      if (legacy) sessionStorage.removeItem(oldStorageKey);
      // Only an unsaved shared draft is worth restoring; otherwise the server copy is loaded below.
      const saved = legacy ?? (sharedLink && dirty?.id !== sharedLink.id ? null : localStorage.getItem(key));
      if (saved) draft = sanitizeDraft(JSON.parse(saved) as unknown);
    } catch { /* A damaged browser draft starts fresh. */ }

    if (!sharedLink && hash.has("copy")) {
      try {
        const parsed = eventPlanSchema.safeParse(JSON.parse(decodeURIComponent(hash.get("copy") ?? "")) as unknown);
        const hasOwnWork = !!draft && JSON.stringify(draft) !== JSON.stringify(emptyPlan) && JSON.stringify(draft) !== JSON.stringify(parsed.data);
        if (parsed.success && (!hasOwnWork || window.confirm("Open the copied plan? It will replace the plan saved on this device."))) draft = parsed.data;
      } catch { /* Invalid copied links leave the local plan intact. */ }
      // Drop the copy from the address bar so a reload does not wipe later edits.
      history.replaceState(null, "", location.pathname + location.search);
    }
    if (draft) setPlan(draft);
    setDraftKey(key);
    setHydrated(true);

    if (sharedLink) {
      fetch("/api/plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sharedLink) })
        .then(async response => {
          const data = await response.json() as { plan?: unknown; version?: number; error?: string };
          if (!response.ok) throw new Error(data.error ?? "Could not open the shared plan.");
          const parsed = eventPlanSchema.safeParse(data.plan);
          if (!parsed.success || !data.version) throw new Error("The shared plan could not be read.");
          const preserveDraft = editedDuringLoad.current || (dirty?.id === sharedLink.id && !!draft);
          const version = preserveDraft && dirty?.id === sharedLink.id && Number.isInteger(dirty.version) ? dirty.version! : data.version;
          if (!preserveDraft) setPlan(parsed.data);
          setShared({ ...sharedLink, version }); setUnsavedChanges(preserveDraft); setSharedLoadError(null);
          if (preserveDraft) sessionStorage.setItem(dirtySharedKey, JSON.stringify({ id: sharedLink.id, version }));
          else sessionStorage.removeItem(dirtySharedKey);
          sessionStorage.setItem(sharedStorageKey, JSON.stringify({ ...sharedLink, version }));
        }).catch(error => setSharedLoadError(error instanceof Error ? error.message : "Could not open the shared plan."));
    }
  }, []);

  useEffect(() => { if (hydrated && draftKey) { try { localStorage.setItem(draftKey, JSON.stringify(plan)); } catch { /* Browser storage may be unavailable. */ } } }, [plan, hydrated, draftKey]);
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
        setDirectoryReady(true);
      })
      .catch(() => { if (active) { setDirectoryError("Couldn’t load the vendor directory. Showing clearly labeled example listings instead."); setDirectoryReady(true); } });
    return () => { active = false; };
  }, []);

  function setField<K extends keyof EventPlan>(key: K): Dispatch<SetStateAction<EventPlan[K]>> {
    return value => { editedDuringLoad.current = true; if (shared) { setUnsavedChanges(true); sessionStorage.setItem(dirtySharedKey, JSON.stringify({ id: shared.id, version: shared.version })); } setPlan(current => ({
      ...current,
      [key]: typeof value === "function" ? (value as (previous: EventPlan[K]) => EventPlan[K])(current[key]) : value,
    })); };
  }

  async function refreshShared() {
    if (!shared) return;
    const response = await fetch("/api/plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: shared.id, token: shared.token }) });
    const data = await response.json() as { plan?: unknown; version?: number; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not refresh the shared plan.");
    const parsed = eventPlanSchema.safeParse(data.plan);
    if (!parsed.success || !data.version) throw new Error("The shared plan could not be read.");
    setPlan(parsed.data); setShared({ ...shared, version: data.version }); setUnsavedChanges(false); setSharedLoadError(null); sessionStorage.removeItem(dirtySharedKey);
    sessionStorage.setItem(sharedStorageKey, JSON.stringify({ ...shared, version: data.version }));
  }

  async function saveAndShare(): Promise<ShareResult> {
    const parsed = eventPlanSchema.safeParse(plan);
    if (!parsed.success) throw new Error("Check the event details before saving the plan.");
    if (shared && !unsavedChanges) return { link: `${location.origin}${location.pathname}?plan=${shared.id}#key=${shared.token}`, live: true };
    const body = shared ? { id: shared.id, token: shared.token, version: shared.version, plan: parsed.data } : { plan: parsed.data };
    try {
      const response = await fetch("/api/plans", { method: shared ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { id?: string; token?: string; version?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save the plan.");
      if (shared && data.version) { const next = { ...shared, version: data.version }; setShared(next); setUnsavedChanges(false); sessionStorage.removeItem(dirtySharedKey); sessionStorage.setItem(sharedStorageKey, JSON.stringify(next)); return { link: `${location.origin}${location.pathname}?plan=${shared.id}#key=${shared.token}`, live: true }; }
      if (!data.id || !data.token || !data.version) throw new Error("Could not save the plan.");
      const next = { id: data.id, token: data.token, version: data.version };
      const url = `${location.origin}${location.pathname}?plan=${next.id}#key=${next.token}`;
      history.replaceState(null, "", url); setShared(next); setDraftKey(draftKeyFor(next.id)); setUnsavedChanges(false); sessionStorage.removeItem(dirtySharedKey);
      sessionStorage.setItem(sharedStorageKey, JSON.stringify(next));
      return { link: url, live: true };
    } catch (error) {
      if (shared) throw error;
      const copy = `${location.origin}/#copy=${encodeURIComponent(JSON.stringify(parsed.data))}`;
      if (copy.length > 12000) throw new Error("This plan is too large for a copy link. Try saving it again later.");
      return { link: copy, live: false };
    }
  }

  return <PlanContext.Provider value={{ plan, setField, resetPlan: () => { setPlan(emptyPlan); setShared(null); setDraftKey(storageKey); setUnsavedChanges(false); sessionStorage.removeItem(sharedStorageKey); sessionStorage.removeItem(dirtySharedKey); history.replaceState(null, "", location.pathname); }, shared: !!shared, unsavedChanges, sharedLoadError, saveAndShare, refreshShared, vendors, directoryReady, directorySource, directoryWarning, directoryError }}>{children}</PlanContext.Provider>;
}

export function useEventPlan() {
  const value = useContext(PlanContext);
  if (!value) throw new Error("EventPlanProvider is missing.");
  return value;
}
