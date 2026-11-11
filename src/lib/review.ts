import { analysisInputSchema, type AnalysisInput } from "./contract";

const wholeMinuteInput = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function normalizeArrivalInput(value: string): string | null {
  if (!value) return null;
  if (!wholeMinuteInput.test(value)) {
    throw new Error("Enter a valid 24-hour arrival time in HH:MM format, such as 17:00.");
  }
  return `${value}:00`;
}

export function clockToInput(value: string | null): string {
  return value ? value.slice(0, 5) : "";
}

export function formatClock(value: string | null): string {
  if (!value) return "Unknown";
  const match = value.match(/(?:^|T)(\d{2}):(\d{2})/);
  if (!match) return "Unknown";
  return match[1] + ":" + match[2];
}

export function formatMinutes(value: number | null): string {
  if (value === null) return "Unknown";
  return `${value} minute${value === 1 ? "" : "s"}`;
}

export function buildAnalysisInput(
  event: AnalysisInput["snapshot"]["event"],
  proposedArrivalTime: string | null,
): AnalysisInput {
  return analysisInputSchema.parse({
    contract_version: "planning.v1",
    snapshot: {
      event: structuredClone(event),
      proposed_change: {
        vendor_id: event.vendor.vendor_id,
        proposed_arrival_time: proposedArrivalTime,
      },
    },
  });
}

export function dependentTasks(
  event: AnalysisInput["snapshot"]["event"],
) {
  return event.tasks.filter((task) =>
    task.depends_on_vendor_ids.includes(event.vendor.vendor_id),
  );
}
