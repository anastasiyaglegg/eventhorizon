"""The fictional event routed through the capability-based configuration."""

from datetime import date, time

from .configuration import (
    CompiledOperationalScenario,
    ConfiguredActivity,
    ConfiguredOperationalChange,
    ConfiguredResource,
    ConfiguredSourceRecord,
    EvidenceReference,
    OperationalScenarioConfig,
    compile_operational_scenario,
)


SAMPLE_EVENT_CONFIGURATION = OperationalScenarioConfig(
    scenario_id="event-north-star-product-launch",
    display_name="North Star Product Launch",
    operation_date=date(2026, 11, 20),
    operation_start_time=time(18, 0),
    resources=(
        ConfiguredResource(
            resource_id="caterer-001",
            display_name="Harborlight Catering",
            source_record_id="vendor-record-caterer-001",
            scheduled_arrival_time=time(14, 30),
            setup_duration_minutes=90,
        ),
    ),
    activities=(
        ConfiguredActivity(
            activity_id="venue-access",
            display_name="Venue access window",
            source_record_id="event-task-venue-access",
            scheduled_start_time=time(14, 0),
            scheduled_end_time=time(14, 30),
        ),
        ConfiguredActivity(
            activity_id="av-line-check",
            display_name="Audio-visual line check",
            source_record_id="event-task-av-line-check",
            scheduled_start_time=time(16, 0),
            scheduled_end_time=time(16, 30),
        ),
        ConfiguredActivity(
            activity_id="guest-check-in",
            display_name="Guest check-in setup",
            source_record_id="event-task-guest-check-in",
            scheduled_start_time=time(17, 0),
            scheduled_end_time=time(17, 30),
        ),
        ConfiguredActivity(
            activity_id="doors-open",
            display_name="Doors open",
            source_record_id="event-task-doors-open",
            scheduled_start_time=time(17, 30),
            scheduled_end_time=time(18, 0),
        ),
    ),
    operational_changes=(
        ConfiguredOperationalChange(
            change_id="event-change-caterer-late-arrival",
            resource_id="caterer-001",
            source_record_id="event-change-caterer-late-arrival",
            proposed_arrival_time=time(15, 0),
        ),
    ),
    selected_change_id="event-change-caterer-late-arrival",
    source_records=(
        ConfiguredSourceRecord(
            record_id="event-north-star-product-launch",
            fields=("name", "event_date", "start_time"),
        ),
        ConfiguredSourceRecord(
            record_id="vendor-record-caterer-001",
            fields=("name", "arrival_time", "setup_duration_minutes"),
        ),
        ConfiguredSourceRecord(
            record_id="event-change-caterer-late-arrival",
            fields=("proposed_arrival_time",),
        ),
        ConfiguredSourceRecord(
            record_id="event-task-venue-access",
            fields=("task_id", "name", "start_time", "end_time"),
        ),
        ConfiguredSourceRecord(
            record_id="event-task-av-line-check",
            fields=("task_id", "name", "start_time", "end_time"),
        ),
        ConfiguredSourceRecord(
            record_id="event-task-guest-check-in",
            fields=("task_id", "name", "start_time", "end_time"),
        ),
        ConfiguredSourceRecord(
            record_id="event-task-doors-open",
            fields=("task_id", "name", "start_time", "end_time"),
        ),
    ),
    evidence_references=(
        EvidenceReference("event", "event-north-star-product-launch", "event-north-star-product-launch", "name"),
        EvidenceReference("event", "event-north-star-product-launch", "event-north-star-product-launch", "event_date"),
        EvidenceReference("event", "event-north-star-product-launch", "event-north-star-product-launch", "start_time"),
        EvidenceReference("resource", "caterer-001", "vendor-record-caterer-001", "name"),
        EvidenceReference("resource", "caterer-001", "vendor-record-caterer-001", "arrival_time"),
        EvidenceReference("resource", "caterer-001", "vendor-record-caterer-001", "setup_duration_minutes"),
        EvidenceReference("change", "event-change-caterer-late-arrival", "event-change-caterer-late-arrival", "proposed_arrival_time"),
        EvidenceReference("activity", "venue-access", "event-task-venue-access", "task_id"),
        EvidenceReference("activity", "venue-access", "event-task-venue-access", "name"),
        EvidenceReference("activity", "venue-access", "event-task-venue-access", "start_time"),
        EvidenceReference("activity", "venue-access", "event-task-venue-access", "end_time"),
        EvidenceReference("activity", "av-line-check", "event-task-av-line-check", "task_id"),
        EvidenceReference("activity", "av-line-check", "event-task-av-line-check", "name"),
        EvidenceReference("activity", "av-line-check", "event-task-av-line-check", "start_time"),
        EvidenceReference("activity", "av-line-check", "event-task-av-line-check", "end_time"),
        EvidenceReference("activity", "guest-check-in", "event-task-guest-check-in", "task_id"),
        EvidenceReference("activity", "guest-check-in", "event-task-guest-check-in", "name"),
        EvidenceReference("activity", "guest-check-in", "event-task-guest-check-in", "start_time"),
        EvidenceReference("activity", "guest-check-in", "event-task-guest-check-in", "end_time"),
        EvidenceReference("activity", "doors-open", "event-task-doors-open", "task_id"),
        EvidenceReference("activity", "doors-open", "event-task-doors-open", "name"),
        EvidenceReference("activity", "doors-open", "event-task-doors-open", "start_time"),
        EvidenceReference("activity", "doors-open", "event-task-doors-open", "end_time"),
    ),
)


SAMPLE_EVENT_COMPILED: CompiledOperationalScenario = compile_operational_scenario(
    SAMPLE_EVENT_CONFIGURATION
)
SAMPLE_EVENT = SAMPLE_EVENT_COMPILED.snapshot.event
PROPOSED_LATE_ARRIVAL = SAMPLE_EVENT_COMPILED.snapshot.proposed_change
