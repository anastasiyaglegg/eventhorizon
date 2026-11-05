"""The provider-facing planning.v1 contract and strict response validation."""

from dataclasses import dataclass
import re
from typing import Any, Mapping

from .models import FrozenEventSnapshot


PLANNING_AGENT_NAME = "planning"
PLANNING_CONTRACT_VERSION = "planning.v1"

PLANNING_AGENT_INSTRUCTIONS = """You are the Event Horizon Planning Agent.
Analyze only the frozen event snapshot and proposed vendor arrival change.
Identify potentially affected task IDs, scheduling risks, evidence, unknowns,
and what the coordinator should review. Never invent times, costs,
confirmations, or task IDs. Treat missing information as unknown. Exact time
overlap calculations are performed by deterministic application code; do not
recalculate or assert them as confirmed operational problems. Return only a
JSON object matching the planning.v1 response structure. Do not make changes.
"""


VALID_RESPONSE_KEYS = {
    "agent",
    "contract_version",
    "status",
    "affected_task_ids",
    "scheduling_risks",
    "unknowns",
    "recommendation",
}
RISK_KEYS = {"type", "description", "task_ids", "evidence"}
RECOMMENDATION_KEYS = {"action", "task_ids"}
EVIDENCE_SOURCES = {"event", "vendor", "proposed_change", "task"}
EVIDENCE_FIELDS = {
    "event": {"name", "event_date", "start_time"},
    "vendor": {"vendor_id", "name", "arrival_time", "setup_duration_minutes"},
    "proposed_change": {"vendor_id", "proposed_arrival_time"},
    "task": {"task_id", "name", "start_time", "end_time"},
}
UNSUPPORTED_CLAIM_PATTERNS = (
    ("exact time", re.compile(r"\b(?:[01]?\d|2[0-3]):[0-5]\d\b")),
    ("cost or price", re.compile(r"(?:[$€£]\s*\d|\b(?:cost|costs|price|budget)\b)", re.I)),
    ("future certainty", re.compile(r"\b(?:will|definitely|guaranteed)\b", re.I)),
    ("unverified confirmation", re.compile(r"\b(?:is|was|has been)\s+(?:confirmed|approved|booked)\b", re.I)),
)


@dataclass(frozen=True)
class PlanningResponseValidationError(ValueError):
    """A safe, structured validation failure for a provider response."""

    code: str
    message: str
    details: tuple[str, ...] = ()

    def __str__(self) -> str:
        return self.message


def planning_error_response(
    code: str,
    message: str,
    details: tuple[str, ...] = (),
) -> dict[str, Any]:
    """Build the agreed planning.v1 error envelope."""

    return {
        "agent": PLANNING_AGENT_NAME,
        "contract_version": PLANNING_CONTRACT_VERSION,
        "status": "error",
        "error": {
            "code": code,
            "message": message,
            "details": list(details),
        },
    }


def _require_string(value: object, field: str, errors: list[str]) -> None:
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{field} must be a non-empty string")


def _validate_planning_text(value: object, field: str, errors: list[str]) -> None:
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{field} must be a non-empty string")
        return
    for label, pattern in UNSUPPORTED_CLAIM_PATTERNS:
        if pattern.search(value):
            errors.append(
                f"{field} contains an unsupported {label} claim; use evidence "
                "references or report it as unknown"
            )


def _validate_id_list(
    value: object,
    field: str,
    task_ids: set[str],
    errors: list[str],
) -> None:
    if not isinstance(value, list):
        errors.append(f"{field} must be a list")
        return
    seen: set[str] = set()
    for index, task_id in enumerate(value):
        if not isinstance(task_id, str) or not task_id:
            errors.append(f"{field}[{index}] must be a non-empty string")
        elif task_id not in task_ids:
            errors.append(f"{field}[{index}] contains unknown task ID {task_id!r}")
        elif task_id in seen:
            errors.append(f"{field}[{index}] repeats task ID {task_id!r}")
        if isinstance(task_id, str):
            seen.add(task_id)


def _validate_evidence(
    evidence: object,
    task_ids: set[str],
    snapshot: FrozenEventSnapshot,
    errors: list[str],
    field: str,
) -> None:
    if not isinstance(evidence, list):
        errors.append(f"{field} must be a list")
        return
    if not evidence:
        errors.append(f"{field} must cite at least one source field")
        return
    for index, item in enumerate(evidence):
        item_field = f"{field}[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{item_field} must be an object")
            continue
        keys = set(item)
        if not {"source", "field"}.issubset(keys) or not keys.issubset(
            {"source", "id", "field"}
        ):
            errors.append(
                f"{item_field} must contain source and field, with optional id"
            )
            continue
        source = item["source"]
        source_field = item["field"]
        if not isinstance(source, str) or source not in EVIDENCE_SOURCES:
            errors.append(f"{item_field}.source is unsupported")
            continue
        if not isinstance(source_field, str) or source_field not in EVIDENCE_FIELDS[source]:
            errors.append(f"{item_field}.field is unsupported for {source}")
        if "id" in item and (not isinstance(item["id"], str) or not item["id"]):
            errors.append(f"{item_field}.id must be a non-empty string")
        if source == "vendor" and "id" in item and item["id"] != snapshot.event.vendor.vendor_id:
            errors.append(f"{item_field}.id does not match the snapshot vendor")
        if source == "proposed_change" and "id" in item and item["id"] != snapshot.proposed_change.vendor_id:
            errors.append(f"{item_field}.id does not match the proposed change")
        if source in {"vendor", "task"} and "id" not in item:
            errors.append(f"{item_field}.id is required for {source} evidence")
        if source == "task" and isinstance(item.get("id"), str) and item["id"] not in task_ids:
            errors.append(f"{item_field}.id contains an unknown task ID")


def validate_planning_response(
    payload: object,
    snapshot: FrozenEventSnapshot,
) -> dict[str, Any]:
    """Validate a provider response without adding calculation results."""

    errors: list[str] = []
    if not isinstance(payload, dict):
        raise PlanningResponseValidationError(
            "invalid_response", "Planning response must be a JSON object", ("root must be an object",)
        )
    if set(payload) != VALID_RESPONSE_KEYS:
        errors.append("response keys do not match planning.v1")
    if payload.get("agent") != PLANNING_AGENT_NAME:
        errors.append("agent must be 'planning'")
    if payload.get("contract_version") != PLANNING_CONTRACT_VERSION:
        errors.append("contract_version must be 'planning.v1'")
    if payload.get("status") != "ok":
        errors.append("status must be 'ok' for a provider success")

    task_ids = {task.task_id for task in snapshot.event.tasks}
    _validate_id_list(payload.get("affected_task_ids"), "affected_task_ids", task_ids, errors)
    risks = payload.get("scheduling_risks")
    if not isinstance(risks, list):
        errors.append("scheduling_risks must be a list")
    else:
        for index, risk in enumerate(risks):
            field = f"scheduling_risks[{index}]"
            if not isinstance(risk, dict) or set(risk) != RISK_KEYS:
                errors.append(f"{field} must contain exactly type, description, task_ids, evidence")
                continue
            _require_string(risk["type"], f"{field}.type", errors)
            _validate_planning_text(risk["description"], f"{field}.description", errors)
            _validate_id_list(risk["task_ids"], f"{field}.task_ids", task_ids, errors)
            _validate_evidence(risk["evidence"], task_ids, snapshot, errors, f"{field}.evidence")
            # A valid task ID referenced elsewhere is not evidence for this risk.
            # A cited task field must actually support each task named in the risk.
            if isinstance(risk["task_ids"], list) and isinstance(risk["evidence"], list):
                cited_task_ids = {
                    item.get("id") for item in risk["evidence"]
                    if isinstance(item, dict) and item.get("source") == "task"
                    and isinstance(item.get("id"), str)
                    and isinstance(item.get("field"), str)
                    and item["field"] in EVIDENCE_FIELDS["task"]
                }
                for task_id in risk["task_ids"]:
                    if isinstance(task_id, str) and task_id in task_ids and task_id not in cited_task_ids:
                        errors.append(f"{field}.evidence lacks task evidence for {task_id!r}")

    unknowns = payload.get("unknowns")
    if not isinstance(unknowns, list):
        errors.append("unknowns must be a list")
    else:
        for index, unknown in enumerate(unknowns):
            _require_string(unknown, f"unknowns[{index}]", errors)

    recommendation = payload.get("recommendation")
    if not isinstance(recommendation, dict) or set(recommendation) != RECOMMENDATION_KEYS:
        errors.append("recommendation must contain exactly action and task_ids")
    else:
        _validate_planning_text(recommendation["action"], "recommendation.action", errors)
        _validate_id_list(recommendation["task_ids"], "recommendation.task_ids", task_ids, errors)

    if errors:
        raise PlanningResponseValidationError("invalid_response", "Planning response failed validation", tuple(errors))
    return payload
