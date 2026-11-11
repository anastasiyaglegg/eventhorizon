import type { ReactNode } from "react";
import Link from "next/link";
import { EventPlanProvider } from "../client/event-plan";
import { PlanActions } from "../client/plan-actions";
import { VenueRequiredNotice } from "../client/venue-required-notice";
import "./globals.css";

export const metadata = { title: "Event Horizon" };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><EventPlanProvider>
    <nav className="site-nav" aria-label="Main navigation">
      <Link className="site-brand" href="/">✦ Event Horizon</Link>
      <div className="site-nav-links">
        <Link href="/vendors">Search &amp; add</Link>
        <Link href="/calendar">Calendar</Link>
        <Link href="/conflicts">Potential conflicts</Link>
        <Link href="/arrival">Arrival and setup</Link>
        <Link href="/report">Report</Link>
      </div>
      <PlanActions />
    </nav>
    <VenueRequiredNotice />
    {children}
  </EventPlanProvider></body></html>;
}
