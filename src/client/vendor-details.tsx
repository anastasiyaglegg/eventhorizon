"use client";

import { useEffect, useId, useRef } from "react";
import { capacityLabel, samplePrice, type Vendor } from "../lib/vendor-search";

export function VendorDetailsDialog({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (vendor && !dialog.current?.open) dialog.current?.showModal();
    if (!vendor && dialog.current?.open) dialog.current.close();
  }, [vendor]);

  return <dialog ref={dialog} className="booking-dialog vendor-details-dialog" aria-labelledby={titleId} onClose={onClose}>
    {vendor && <>
      <div className="booking-heading"><div><p className="eyebrow">Vendor details</p><h2 id={titleId}>{vendor.name}</h2></div><button type="button" className="secondary-button" onClick={() => dialog.current?.close()}>Close</button></div>
      {vendor.isSynthetic && <p className="helper">This is a fictional sample listing. Its contact and review details are examples, not a real booking lead.</p>}
      <p>{vendor.details}</p>
      <dl className="vendor-details-list">
        <div><dt>Location</dt><dd>{vendor.borough}</dd></div>
        <div><dt>{vendor.isSynthetic ? "Sample price" : "Listed price"}</dt><dd>{samplePrice(vendor)}</dd></div>
        <div><dt>Capacity</dt><dd>{capacityLabel(vendor)}</dd></div>
        <div><dt>{vendor.isSynthetic ? "Sample contact" : "Contact email"}</dt><dd>{vendor.contactEmail ?? "Not listed"}</dd></div>
        <div><dt>Website</dt><dd>{vendor.sourceUrl ? <a href={vendor.sourceUrl} target="_blank" rel="noopener noreferrer">Visit vendor website</a> : "Not listed"}</dd></div>
      </dl>
      {vendor.review && <p className="helper">{vendor.isSynthetic ? "Sample review" : "Review summary"}: “{vendor.review}”</p>}
      <p className="helper">{vendor.isSynthetic ? "Use this sample to practice planning; it cannot be contacted or booked." : "Contact the vendor directly to confirm price, availability, and any booking."}</p>
    </>}
  </dialog>;
}
