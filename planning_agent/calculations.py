"""Deterministic planning calculations kept separate from AI behavior."""

from dataclasses import dataclass
from datetime import datetime, timedelta, time
from typing import Literal, Optional

from .models import FrozenEventSnapshot


OverlapStatus = Literal["overlap", "no_overlap", "unknown"]


@dataclass(frozen=True)
class OverlapResult:
    """The deterministic answer for one vendor setup window."""

    status: OverlapStatus
    overlapping_task_ids: tuple[str, ...] = ()
    setup_start: Optional[time] = None
    setup_end: Optional[time] = None
    reason: Optional[str] = None
    incomplete_task_ids: tuple[str, ...] = ()
    # Each task's intersection is measured independently; don't add overlapping
    # task durations into a single total (which would double-count clock time).
    overlap_minutes_by_task: tuple[tuple[str, float], ...] = ()
    setup_minutes_after_event_start: Optional[float] = None


def calculate_setup_overlap(snapshot: FrozenEventSnapshot) -> OverlapResult:
    """Determine whether the proposed vendor setup overlaps any event task.

    Exact time arithmetic is performed here, outside any future AI agent. If a
    required time or duration is missing or invalid, the result is ``unknown``.
    Missing or invalid task timing is reported separately so it cannot hide
    confirmed overlaps found on other tasks. If at least one confirmed overlap
    exists, the status remains ``overlap`` and incomplete task IDs are included
    alongside it. Boundary-touching windows do not overlap: a setup ending at
    16:00 does not overlap a task beginning at 16:00.
    """

    event = snapshot.event
    change = snapshot.proposed_change

    if change.vendor_id != event.vendor.vendor_id:
        return OverlapResult(
            status="unknown",
            reason="The proposed change refers to a different vendor.",
        )

    arrival = change.proposed_arrival_time
    setup_duration = event.vendor.setup_duration_minutes
    if arrival is None:
        return OverlapResult(
            status="unknown",
            reason="The proposed vendor arrival time is missing.",
        )
    if setup_duration is None or setup_duration <= 0:
        return OverlapResult(
            status="unknown",
            reason="The vendor setup duration is missing or invalid.",
        )

    setup_start = datetime.combine(event.event_date, arrival)
    setup_end = setup_start + timedelta(minutes=setup_duration)

    overlapping_task_ids = []
    overlap_minutes_by_task = []
    # Time spent setting up after the event has begun is calculated by code,
    # not inferred by the Planning Agent.
    event_start = datetime.combine(event.event_date, event.start_time)
    setup_minutes_after_event_start = max(
        0.0, (setup_end - max(setup_start, event_start)).total_seconds() / 60
    )
    incomplete_task_ids = []
    timing_issues = []
    for task in event.tasks:
        if task.start_time is None or task.end_time is None:
            incomplete_task_ids.append(task.task_id)
            timing_issues.append(
                f"Task '{task.task_id}' is missing a start or end time."
            )
            continue

        task_start = datetime.combine(event.event_date, task.start_time)
        task_end = datetime.combine(event.event_date, task.end_time)
        if task_end <= task_start:
            incomplete_task_ids.append(task.task_id)
            timing_issues.append(
                f"Task '{task.task_id}' has an invalid time range."
            )
            continue

        intersection_start = max(setup_start, task_start)
        intersection_end = min(setup_end, task_end)
        if intersection_end > intersection_start:
            overlapping_task_ids.append(task.task_id)
            overlap_minutes_by_task.append(
                (task.task_id, (intersection_end - intersection_start).total_seconds() / 60)
            )

    if overlapping_task_ids:
        return OverlapResult(
            status="overlap",
            overlapping_task_ids=tuple(overlapping_task_ids),
            setup_start=setup_start.time(),
            setup_end=setup_end.time(),
            reason="; ".join(timing_issues) or None,
            incomplete_task_ids=tuple(incomplete_task_ids),
            overlap_minutes_by_task=tuple(overlap_minutes_by_task),
            setup_minutes_after_event_start=setup_minutes_after_event_start,
        )

    if incomplete_task_ids:
        return OverlapResult(
            status="unknown",
            setup_start=setup_start.time(),
            setup_end=setup_end.time(),
            reason="; ".join(timing_issues),
            incomplete_task_ids=tuple(incomplete_task_ids),
            overlap_minutes_by_task=tuple(overlap_minutes_by_task),
            setup_minutes_after_event_start=setup_minutes_after_event_start,
        )

    return OverlapResult(
        status="no_overlap",
        setup_start=setup_start.time(),
        setup_end=setup_end.time(),
        overlap_minutes_by_task=tuple(overlap_minutes_by_task),
        setup_minutes_after_event_start=setup_minutes_after_event_start,
    )
