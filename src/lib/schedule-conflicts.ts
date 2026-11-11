import { DateTime } from "luxon";

export type ScheduleSlot = { date: string; start: string; end: string };
export type NamedSchedule = { id: string; name: string; slot: ScheduleSlot };
export const validSchedule = (slot: ScheduleSlot) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.start) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.end) || slot.start >= slot.end) return false;
  return [slot.start, slot.end].every(time => {
    const value = DateTime.fromISO(`${slot.date}T${time}`, { zone: "America/New_York" });
    return value.isValid && value.toISODate() === slot.date && value.toFormat("HH:mm") === time && value.getPossibleOffsets().length === 1;
  });
};
/** A shared window signals an overlap to review; it does not prove a conflict. */
export function findScheduleOverlaps(candidate: NamedSchedule, others: NamedSchedule[]): NamedSchedule[] {
  if (!validSchedule(candidate.slot)) return [];
  return others.filter(other => other.id !== candidate.id && validSchedule(other.slot) && other.slot.date === candidate.slot.date && candidate.slot.start < other.slot.end && other.slot.start < candidate.slot.end);
}

export function overlapsForOtherEvent(event: NamedSchedule, otherEvents: NamedSchedule[], plannedVendors: NamedSchedule[]) {
  return findScheduleOverlaps(event, [...otherEvents, ...plannedVendors]);
}
