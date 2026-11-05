"""Local, preview-only orchestration for the seeded Planning demonstration.

This module adapts browser input to the existing frozen snapshot and
deterministic calculation.  The Planning Agent is called with a simulated
provider response so the preview never makes a live AI request.
"""

import json
import re
from dataclasses import replace
from datetime import time
from typing import Any, Mapping, Optional

from planning_agent.calculations import OverlapResult, calculate_setup_overlap
from planning_agent.models import FrozenEventSnapshot, ProposedVendorArrivalChange
from planning_agent.planning_service import PlanningAgent
from planning_agent.provider import PlanningProvider
from planning_agent.sample_event import SAMPLE_EVENT
from planning_agent.snapshot import create_frozen_snapshot


def parse_arrival_time(value: Optional[str]) -> Optional[time]:
    """Parse a browser time value without inventing a missing time."""

    if value is None or not value.strip():
        return None
    clock = value.strip()
    # The browser preview works with one local event clock, not offset-aware times.
    # fromisoformat() alone accepts offsets, which cannot safely be compared here.
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?", clock):
        raise ValueError("Enter a valid arrival time, or leave it blank.")
    return time.fromisoformat(clock)


def _time_text(value: Optional[time]) -> Optional[str]:
    return value.isoformat() if value is not None else None


def _snapshot_for_arrival(
    arrival: Optional[time],
    event=SAMPLE_EVENT,
) -> FrozenEventSnapshot:
    """Create a new immutable preview snapshot without changing SAMPLE_EVENT."""

    return create_frozen_snapshot(
        event,
        ProposedVendorArrivalChange(
            vendor_id=event.vendor.vendor_id,
            proposed_arrival_time=arrival,
        ),
    )


def _evidence_for_tasks(
    snapshot: FrozenEventSnapshot,
    task_ids: tuple[str, ...],
) -> list[dict[str, str]]:
    evidence = [
        {"source": "proposed_change", "field": "proposed_arrival_time"},
        {
            "source": "vendor",
            "id": snapshot.event.vendor.vendor_id,
            "field": "setup_duration_minutes",
        },
    ]
    evidence.extend(
        {"source": "task", "id": task_id, "field": "start_time"}
        for task_id in task_ids
    )
    return evidence


def build_simulated_planning_response(
    snapshot: FrozenEventSnapshot,
    overlap: OverlapResult,
) -> dict[str, Any]:
    """Map deterministic findings into a validated, explicitly simulated response."""

    affected_task_ids = list(overlap.overlapping_task_ids)
    risks: list[dict[str, Any]] = []
    if affected_task_ids:
        risks.append(
            {
                "type": "potential_schedule_conflict",
                "description": (
                    "The proposed arrival creates a potential setup overlap "
                    "with scheduled task(s)."
                ),
                "task_ids": affected_task_ids,
                "evidence": _evidence_for_tasks(
                    snapshot, overlap.overlapping_task_ids
                ),
            }
        )

    unknowns: list[str] = []
    if overlap.incomplete_task_ids:
        unknowns.append(
            "Timing is incomplete for task IDs: "
            + ", ".join(overlap.incomplete_task_ids)
            + "."
        )
    if overlap.reason and not overlap.incomplete_task_ids:
        unknowns.append(overlap.reason)

    if affected_task_ids:
        action = "Review the affected task timing with the coordinator."
    elif overlap.incomplete_task_ids:
        action = "Review the incomplete timing information with the coordinator."
    elif overlap.status == "unknown":
        action = "Review the missing or uncertain timing information with the coordinator."
    else:
        action = "No potential setup overlap was identified by deterministic calculation."

    return {
        "agent": "planning",
        "contract_version": "planning.v1",
        "status": "ok",
        "affected_task_ids": affected_task_ids,
        "scheduling_risks": risks,
        "unknowns": unknowns,
        "recommendation": {
            "action": action,
            "task_ids": affected_task_ids,
        },
    }


class SimulatedPlanningProvider:
    """One simulated combined Planning/Readiness call for the local preview."""

    def __init__(self, snapshot: FrozenEventSnapshot, overlap: OverlapResult) -> None:
        self._snapshot = snapshot
        self._overlap = overlap

    def generate(
        self,
        *,
        instructions: str,
        input_payload: Mapping[str, Any],
        timeout_seconds: float,
    ) -> str:
        del instructions, input_payload, timeout_seconds
        return json.dumps(
            build_simulated_planning_response(self._snapshot, self._overlap)
        )


def _event_payload(
    snapshot: FrozenEventSnapshot,
) -> dict[str, Any]:
    event = snapshot.event
    return {
        "name": event.name,
        "event_date": event.event_date.isoformat(),
        "start_time": _time_text(event.start_time),
        "vendor": {
            "vendor_id": event.vendor.vendor_id,
            "name": event.vendor.name,
            "original_arrival_time": _time_text(event.vendor.arrival_time),
            "setup_duration_minutes": event.vendor.setup_duration_minutes,
            "proposed_arrival_time": _time_text(
                snapshot.proposed_change.proposed_arrival_time
            ),
        },
        "tasks": [
            {
                "task_id": task.task_id,
                "name": task.name,
                "start_time": _time_text(task.start_time),
                "end_time": _time_text(task.end_time),
            }
            for task in event.tasks
        ],
    }


def _overlap_payload(overlap: OverlapResult) -> dict[str, Any]:
    """Serialize deterministic timing findings for the preview boundary."""

    return {
        "status": overlap.status,
        "setup_start": _time_text(overlap.setup_start),
        "setup_end": _time_text(overlap.setup_end),
        "overlapping_task_ids": list(overlap.overlapping_task_ids),
        "overlap_minutes_by_task": [
            {"task_id": task_id, "minutes": minutes}
            for task_id, minutes in overlap.overlap_minutes_by_task
        ],
        "setup_minutes_after_event_start": overlap.setup_minutes_after_event_start,
        "incomplete_task_ids": list(overlap.incomplete_task_ids),
        "reason": overlap.reason,
    }


def _minutes_for_task(overlap: OverlapResult, task_id: str) -> Optional[float]:
    if overlap.setup_start is None or overlap.setup_end is None:
        return None
    return next(
        (minutes for candidate_id, minutes in overlap.overlap_minutes_by_task
         if candidate_id == task_id),
        0.0,
    )


def _review_payload(
    snapshot: FrozenEventSnapshot,
    proposed_overlap: OverlapResult,
    planning: Mapping[str, Any],
) -> dict[str, Any]:
    """Build a read-only before/after view outside the planning.v1 contract."""

    event = snapshot.event
    original_snapshot = create_frozen_snapshot(
        event,
        ProposedVendorArrivalChange(
            vendor_id=event.vendor.vendor_id,
            proposed_arrival_time=event.vendor.arrival_time,
        ),
    )
    original_overlap = calculate_setup_overlap(original_snapshot)
    task_impacts = [
        {
            "task_id": task.task_id,
            "name": task.name,
            "original_overlap_minutes": _minutes_for_task(
                original_overlap, task.task_id
            ),
            "proposed_overlap_minutes": _minutes_for_task(
                proposed_overlap, task.task_id
            ),
        }
        for task in event.tasks
    ]
    return {
        "original_arrival_time": _time_text(event.vendor.arrival_time),
        "proposed_arrival_time": _time_text(
            snapshot.proposed_change.proposed_arrival_time
        ),
        "original": _overlap_payload(original_overlap),
        "proposed": _overlap_payload(proposed_overlap),
        "task_impacts": task_impacts,
        "planning_status": planning.get("status"),
    }


def _approval_payload(
    *,
    planning: Mapping[str, Any],
    overlap: OverlapResult,
    proposed_arrival: Optional[time],
    has_analysis: bool,
) -> dict[str, Any]:
    can_approve = (
        has_analysis
        and planning.get("status") == "ok"
        and proposed_arrival is not None
        and overlap.status != "unknown"
    )
    if planning.get("status") != "ok":
        reason = "Approval is blocked until the combined Planning/Readiness analysis succeeds."
    elif proposed_arrival is None:
        reason = "A proposed arrival time is required before approval."
    elif overlap.status == "unknown":
        reason = "Approval is blocked while required timing information is unknown."
    else:
        reason = "The proposed arrival is ready for human approval."
    return {
        "can_approve": can_approve,
        "can_reject": has_analysis,
        "reason": reason,
    }


class PreviewSession:
    """In-memory local session state for preview-only approve/reject behavior."""

    def __init__(self, event=SAMPLE_EVENT) -> None:
        self._event = event
        self._pending_snapshot: Optional[FrozenEventSnapshot] = None
        self._pending_result: Optional[dict[str, Any]] = None

    @property
    def event(self):
        return self._event

    def analyze(
        self,
        proposed_arrival_text: Optional[str],
        provider: Optional[PlanningProvider] = None,
    ) -> dict[str, Any]:
        """Analyze one proposed value without mutating the session event."""

        try:
            arrival = parse_arrival_time(proposed_arrival_text)
        except ValueError as error:
            self._pending_snapshot = None
            self._pending_result = None
            return {
                "preview_only": True,
                "simulated": True,
                "analysis_mode": "combined_planning_readiness",
                "status": "error",
                "error": {
                    "code": "invalid_arrival_time",
                    "message": str(error),
                },
                "approval": {
                    "can_approve": False,
                    "can_reject": False,
                    "reason": "Approval is blocked until the arrival time is valid.",
                },
            }

        snapshot = _snapshot_for_arrival(arrival, self._event)
        overlap = calculate_setup_overlap(snapshot)
        planning_provider = provider or SimulatedPlanningProvider(snapshot, overlap)
        planning = PlanningAgent(planning_provider).analyze(snapshot)
        status = "ok" if planning.get("status") == "ok" else "error"
        result: dict[str, Any] = {
            "preview_only": True,
            "simulated": True,
            "analysis_mode": "combined_planning_readiness",
            "status": status,
            "event": _event_payload(snapshot),
            "overlap": _overlap_payload(overlap),
            "planning": planning,
            "review": _review_payload(snapshot, overlap, planning),
            "approval": _approval_payload(
                planning=planning,
                overlap=overlap,
                proposed_arrival=arrival,
                has_analysis=True,
            ),
        }
        if status == "error":
            result["error"] = planning.get(
                "error",
                {
                    "code": "planning_analysis_failed",
                    "message": "The combined Planning/Readiness analysis failed.",
                },
            )
        self._pending_snapshot = snapshot
        self._pending_result = result
        return result

    def decide(self, decision: str) -> dict[str, Any]:
        """Apply an explicit local decision without contacting external services."""

        if decision not in {"approve", "reject"}:
            return {
                "status": "error",
                "error": {
                    "code": "invalid_decision",
                    "message": "Decision must be approve or reject.",
                },
            }

        if decision == "reject":
            self._pending_snapshot = None
            self._pending_result = None
            return {
                "status": "ok",
                "decision": "rejected",
                "current_arrival_time": _time_text(self._event.vendor.arrival_time),
                "event_changed": False,
                "message": "Rejected. The current event arrival time was preserved.",
            }

        pending = self._pending_snapshot
        pending_result = self._pending_result
        if pending is None or pending_result is None:
            return {
                "status": "error",
                "error": {
                    "code": "approval_blocked",
                    "message": "Approval is blocked until a valid analysis is available.",
                },
            }
        approval = pending_result.get("approval", {})
        if not approval.get("can_approve"):
            return {
                "status": "error",
                "error": {
                    "code": "approval_blocked",
                    "message": approval.get(
                        "reason",
                        "Approval is blocked until the analysis is valid.",
                    ),
                },
            }

        proposed_arrival = pending.proposed_change.proposed_arrival_time
        if proposed_arrival is None:
            return {
                "status": "error",
                "error": {
                    "code": "approval_blocked",
                    "message": "Approval is blocked because the proposed arrival is missing.",
                },
            }
        self._event = replace(
            self._event,
            vendor=replace(self._event.vendor, arrival_time=proposed_arrival),
        )
        self._pending_snapshot = None
        self._pending_result = None
        return {
            "status": "ok",
            "decision": "approved",
            "current_arrival_time": _time_text(self._event.vendor.arrival_time),
            "event_changed": True,
            "message": "Approved. The local session event arrival time was updated.",
        }


def analyze_preview(
    proposed_arrival_text: Optional[str],
    session: Optional[PreviewSession] = None,
    provider: Optional[PlanningProvider] = None,
) -> dict[str, Any]:
    """Analyze one preview value using a supplied or temporary local session."""

    return (session or PreviewSession()).analyze(
        proposed_arrival_text,
        provider=provider,
    )
