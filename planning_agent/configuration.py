"""Capability-based configuration for operational scheduling demonstrations.

The configuration describes resources, activities, schedules, changes, and
source records.  It deliberately has no industry or business-type field.  A
small compiler translates the configuration into the existing frozen snapshot
used by deterministic planning calculations.
"""

from dataclasses import dataclass
from datetime import date, time
from typing import Optional

from .models import (
    Event,
    EventTask,
    FrozenEventSnapshot,
    ProposedVendorArrivalChange,
    Vendor,
)
from .snapshot import create_frozen_snapshot


@dataclass(frozen=True)
class EvidenceReference:
    """Trace an adapted value to a source record and field."""

    target_kind: str
    target_id: str
    source_record_id: str
    source_field: str


@dataclass(frozen=True)
class ConfiguredSourceRecord:
    """The fields available on one source record for evidence validation."""

    record_id: str
    fields: tuple[str, ...]


@dataclass(frozen=True)
class ConfiguredResource:
    """A schedulable resource with an arrival and setup requirement."""

    resource_id: str
    display_name: str
    source_record_id: str
    scheduled_arrival_time: Optional[time]
    setup_duration_minutes: Optional[int]


@dataclass(frozen=True)
class ConfiguredActivity:
    """A scheduled activity; times may be absent when the source is incomplete."""

    activity_id: str
    display_name: str
    source_record_id: str
    scheduled_start_time: Optional[time]
    scheduled_end_time: Optional[time]


@dataclass(frozen=True)
class ConfiguredOperationalChange:
    """A proposed change to one configured resource."""

    change_id: str
    resource_id: str
    source_record_id: str
    proposed_arrival_time: Optional[time]


@dataclass(frozen=True)
class OperationalScenarioConfig:
    """A capability-based scenario that can be compiled for analysis."""

    scenario_id: str
    display_name: str
    operation_date: date
    operation_start_time: time
    resources: tuple[ConfiguredResource, ...]
    activities: tuple[ConfiguredActivity, ...]
    operational_changes: tuple[ConfiguredOperationalChange, ...]
    selected_change_id: str
    source_records: tuple[ConfiguredSourceRecord, ...]
    evidence_references: tuple[EvidenceReference, ...]


@dataclass(frozen=True)
class CompiledOperationalScenario:
    """The common snapshot plus validated traces from a configuration."""

    snapshot: FrozenEventSnapshot
    evidence_references: tuple[EvidenceReference, ...]


@dataclass(frozen=True)
class EvidenceValidationResult:
    """Evidence validation outcome without changing the source configuration."""

    valid: bool
    errors: tuple[str, ...]


class ConfigurationError(ValueError):
    """Raised when a scenario cannot be safely compiled."""

    def __init__(self, errors: tuple[str, ...]):
        self.errors = errors
        super().__init__("; ".join(errors))


def _duplicate_id_errors(values: tuple[str, ...], label: str) -> list[str]:
    seen: set[str] = set()
    errors: list[str] = []
    for value in values:
        if not value:
            errors.append(f"{label} IDs must be non-empty")
        elif value in seen:
            errors.append(f"{label} ID {value!r} is duplicated")
        seen.add(value)
    return errors


def _known_targets(config: OperationalScenarioConfig) -> dict[str, set[str]]:
    return {
        "event": {config.scenario_id},
        "resource": {resource.resource_id for resource in config.resources},
        "activity": {activity.activity_id for activity in config.activities},
        "change": {
            change.change_id for change in config.operational_changes
        },
    }


def validate_evidence_references(
    config: OperationalScenarioConfig,
) -> EvidenceValidationResult:
    """Verify every evidence target, source record, and source field."""

    targets = _known_targets(config)
    source_fields = {
        record.record_id: set(record.fields)
        for record in config.source_records
    }
    errors: list[str] = []

    for index, reference in enumerate(config.evidence_references):
        prefix = f"evidence[{index}]"
        if reference.target_kind not in targets:
            errors.append(f"{prefix} has unknown target kind {reference.target_kind!r}")
        elif reference.target_id not in targets[reference.target_kind]:
            errors.append(
                f"{prefix} targets unknown {reference.target_kind} "
                f"{reference.target_id!r}"
            )

        fields = source_fields.get(reference.source_record_id)
        if fields is None:
            errors.append(
                f"{prefix} references unknown source record "
                f"{reference.source_record_id!r}"
            )
        elif reference.source_field not in fields:
            errors.append(
                f"{prefix} references missing field {reference.source_field!r} "
                f"on {reference.source_record_id!r}"
            )

    return EvidenceValidationResult(valid=not errors, errors=tuple(errors))


def compile_operational_scenario(
    config: OperationalScenarioConfig,
) -> CompiledOperationalScenario:
    """Compile one configured resource/change into the common snapshot shape."""

    errors: list[str] = []
    errors.extend(
        _duplicate_id_errors(
            tuple(resource.resource_id for resource in config.resources),
            "resource",
        )
    )
    errors.extend(
        _duplicate_id_errors(
            tuple(activity.activity_id for activity in config.activities),
            "activity",
        )
    )
    errors.extend(
        _duplicate_id_errors(
            tuple(change.change_id for change in config.operational_changes),
            "change",
        )
    )
    errors.extend(
        _duplicate_id_errors(
            tuple(record.record_id for record in config.source_records),
            "source record",
        )
    )
    resources = {
        resource.resource_id: resource for resource in config.resources
    }
    changes = {
        change.change_id: change for change in config.operational_changes
    }
    change = changes.get(config.selected_change_id)
    if change is None:
        errors.append(
            f"selected change {config.selected_change_id!r} does not exist"
        )
    else:
        resource = resources.get(change.resource_id)
        if resource is None:
            errors.append(
                f"change {change.change_id!r} references unknown resource "
                f"{change.resource_id!r}"
            )

    evidence = validate_evidence_references(config)
    errors.extend(evidence.errors)
    if errors:
        raise ConfigurationError(tuple(errors))

    resource = resources[change.resource_id]
    event = Event(
        name=config.display_name,
        event_date=config.operation_date,
        start_time=config.operation_start_time,
        vendor=Vendor(
            vendor_id=resource.resource_id,
            name=resource.display_name,
            arrival_time=resource.scheduled_arrival_time,
            setup_duration_minutes=resource.setup_duration_minutes,
        ),
        tasks=tuple(
            EventTask(
                task_id=activity.activity_id,
                name=activity.display_name,
                start_time=activity.scheduled_start_time,
                end_time=activity.scheduled_end_time,
            )
            for activity in config.activities
        ),
    )
    proposed_change = ProposedVendorArrivalChange(
        vendor_id=resource.resource_id,
        proposed_arrival_time=change.proposed_arrival_time,
    )
    return CompiledOperationalScenario(
        snapshot=create_frozen_snapshot(event, proposed_change),
        evidence_references=config.evidence_references,
    )
