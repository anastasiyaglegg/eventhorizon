import { DateTime } from "luxon";
import { AnalysisError, type AnalysisInput, type Calculation } from "./contract";

export function calculateImpact(input: AnalysisInput): Calculation {
  const { event, proposed_change: change } = input.snapshot;
  const taskIds = new Set(event.tasks.map(task => task.task_id));
  if (taskIds.size !== event.tasks.length ||
      change.vendor_id !== event.vendor.vendor_id ||
      event.tasks.some(task => task.depends_on_vendor_ids.some(id => id !== event.vendor.vendor_id))) {
    throw new AnalysisError("invalid_input", "The event contains duplicate or unknown references.");
  }
  const day = DateTime.fromISO(event.event_date, { zone: event.time_zone });
  if (!day.isValid || day.toISODate() !== event.event_date) {
    throw new AnalysisError("invalid_input", "Use a valid event date and IANA time zone.");
  }
  const at = (value: string) => {
    const date = DateTime.fromISO(event.event_date + "T" + value, { zone: event.time_zone });
    if (!date.isValid || date.toFormat("HH:mm:ss") !== value || date.getPossibleOffsets().length > 1) {
      throw new AnalysisError("invalid_input", "This local time is invalid or ambiguous in the event time zone.");
    }
    return date;
  };
  // All entered times belong to the event date. Setup duration can cross midnight.
  for (const value of [event.start_time, event.vendor.arrival_time,
    change.proposed_arrival_time, ...event.tasks.flatMap(task => [task.start_time, task.end_time])]) {
    if (value !== null) at(value);
  }
  for (const task of event.tasks) {
    if (task.start_time && task.end_time && at(task.end_time) <= at(task.start_time)) {
      throw new AnalysisError("invalid_input", "Task end times must follow their starts on the event date.");
    }
  }
  const unknowns: string[] = [];
  if (change.proposed_arrival_time === null) unknowns.push("Proposed vendor arrival time is unknown.");
  if (event.vendor.setup_duration_minutes === null) unknowns.push("Vendor setup duration is unknown.");
  if (event.start_time === null) unknowns.push("Event start time is unknown.");
  if (change.proposed_arrival_time === null || event.vendor.setup_duration_minutes === null) {
    return { setup_finish: null, overlap_minutes: null, affected_task_ids: [], unknowns };
  }
  const finish = at(change.proposed_arrival_time).plus({ minutes: event.vendor.setup_duration_minutes });
  const affected_task_ids = event.tasks.filter(task => {
    if (!task.depends_on_vendor_ids.includes(event.vendor.vendor_id)) return false;
    if (task.start_time === null) {
      unknowns.push("Start time for task " + task.task_id + " is unknown.");
      return false;
    }
    return finish > at(task.start_time);
  }).map(task => task.task_id);
  return {
    setup_finish: finish.toISO(),
    overlap_minutes: event.start_time === null ? null : Math.max(0, finish.diff(at(event.start_time), "minutes").minutes),
    affected_task_ids,
    unknowns,
  };
}
