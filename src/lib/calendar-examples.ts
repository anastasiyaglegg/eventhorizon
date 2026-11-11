import { DateTime } from "luxon";
import type { ScheduleSlot } from "./schedule-conflicts";

export type ExampleService = "catering" | "florist" | "entertainment" | "bakery" | "av" | "photography" | "decorator";
export type ExampleCalendarEvent = {
  id: string;
  name: string;
  venue: string;
  slot: ScheduleSlot;
  vendors: { id: string; name: string; service: ExampleService; slot: ScheduleSlot }[];
};

/** Fictional entries for a calendar walkthrough. They are never added to a saved plan. */
export function calendarExamples(eventDate: string, now = DateTime.now().setZone("America/New_York")): ExampleCalendarEvent[] {
  const selected = DateTime.fromISO(eventDate, { zone: "America/New_York" });
  const anchor = selected.isValid && selected.toISODate() === eventDate ? selected : now;
  // Keep all three events visible in the calendar's focused month, even if the
  // coordinator's event happens near the end of that month.
  const firstDay = Math.min(Math.max(anchor.day, 2), anchor.daysInMonth! - 7);
  const base = anchor.set({ day: firstDay });
  const day = (offset: number) => base.plus({ days: offset }).toISODate()!;
  const slot = (offset: number, start: string, end: string): ScheduleSlot => ({ date: day(offset), start, end });

  return [
    {
      id: "example-aurora", name: "Venus In Furs", venue: "The Orbit Room", slot: slot(1, "18:00", "21:00"),
      vendors: [
        { id: "example-aurora-catering", name: "Copper Spoon Catering", service: "catering", slot: slot(1, "16:00", "22:00") },
        { id: "example-aurora-av", name: "Prism Sound & Light", service: "av", slot: slot(1, "16:30", "21:00") },
        { id: "example-aurora-photo", name: "Blue Hour Photography", service: "photography", slot: slot(1, "17:00", "21:00") },
      ],
    },
    {
      id: "example-moonlight", name: "Moonlight Museum Mixer", venue: "The Orbit Room", slot: slot(3, "19:00", "22:00"),
      vendors: [
        { id: "example-moonlight-decor", name: "Velvet Orbit Decor", service: "decorator", slot: slot(2, "14:00", "17:00") },
        { id: "example-moonlight-catering", name: "Juniper Table Catering", service: "catering", slot: slot(3, "17:00", "23:00") },
        { id: "example-moonlight-dj", name: "DJ Daybreak", service: "entertainment", slot: slot(3, "18:00", "22:00") },
      ],
    },
    {
      id: "example-comet", name: "Comet City Fundraiser", venue: "The Orbit Room", slot: slot(6, "17:00", "20:00"),
      vendors: [
        { id: "example-comet-florist", name: "Wild Atlas Flowers", service: "florist", slot: slot(5, "11:00", "15:00") },
        { id: "example-comet-bakery", name: "Honey Moon Bakery", service: "bakery", slot: slot(6, "15:00", "21:00") },
        { id: "example-comet-av", name: "Northstar AV", service: "av", slot: slot(6, "16:00", "20:00") },
      ],
    },
  ];
}
