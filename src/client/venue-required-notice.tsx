"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEventPlan } from "./event-plan";

const planningPages = new Set(["/calendar", "/conflicts", "/arrival", "/report"]);

export function VenueRequiredNotice() {
  const pathname = usePathname();
  const { plan, hydrated } = useEventPlan();
  if (!hydrated || plan.selections.venue || !planningPages.has(pathname)) return null;
  return <div className="alert venue-required-notice" role="alert">
    <strong>A venue is required to complete this event.</strong> You can review your work here, then <Link href="/vendors">choose a venue</Link> before finalizing the plan.
  </div>;
}
