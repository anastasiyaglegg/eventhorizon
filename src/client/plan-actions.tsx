"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useEventPlan } from "./event-plan";

export function PlanActions() {
  const { shared, unsavedChanges, sharedLoadError, saveAndShare, refreshShared } = useEventPlan();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const result = await saveAndShare();
      setLink(result.link);
      try { await navigator.clipboard.writeText(result.link); }
      catch { /* The link remains visible for manual copying. */ }
      setMessage(result.live
        ? "Saved. Anyone with this link can view and edit the plan. Share it only with your planning partner."
        : "A copy link is ready. Changes made after you share it will not appear in that copy.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save the plan."); }
    finally { setBusy(false); }
  }

  async function refresh() {
    if (unsavedChanges && !window.confirm("Refresh from the shared plan? Your unsaved changes will be lost.")) return;
    setBusy(true); setMessage(null);
    try { await refreshShared(); setMessage("The latest shared plan is here."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not refresh the plan."); }
    finally { setBusy(false); }
  }

  if (pathname === "/review") return null;
  return <div className="plan-actions">
    <div className="plan-actions-buttons">
      <button type="button" disabled={busy} onClick={save}>{busy ? "Working…" : shared ? unsavedChanges ? "Save changes" : "Copy share link" : "Save & share"}</button>
      {shared && <button type="button" disabled={busy} onClick={refresh}>Get latest</button>}
    </div>
    {(message || sharedLoadError) && <p role="status">{message ?? sharedLoadError}</p>}
    {link && <input aria-label="Share link" readOnly value={link} onFocus={event => event.target.select()} />}
  </div>;
}
