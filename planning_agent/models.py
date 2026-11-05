"""Immutable domain models used by the future Planning Agent."""

from dataclasses import dataclass
from datetime import date, time
from typing import Optional


@dataclass(frozen=True)
class Vendor:
    """A vendor record from the seeded event."""

    vendor_id: str
    name: str
    arrival_time: Optional[time]
    setup_duration_minutes: Optional[int]


@dataclass(frozen=True)
class EventTask:
    """A scheduled event activity.

    Missing start or end times are represented explicitly as ``None`` so the
    deterministic calculation can return an unknown result instead of guessing.
    """

    task_id: str
    name: str
    start_time: Optional[time]
    end_time: Optional[time]


@dataclass(frozen=True)
class Event:
    """The single seeded event used by the Phase 1 foundation."""

    name: str
    event_date: date
    start_time: time
    vendor: Vendor
    tasks: tuple[EventTask, ...]


@dataclass(frozen=True)
class ProposedVendorArrivalChange:
    """A proposed arrival time for the event's vendor."""

    vendor_id: str
    proposed_arrival_time: Optional[time]


@dataclass(frozen=True)
class FrozenEventSnapshot:
    """Read-only event inputs handed to future agent logic."""

    event: Event
    proposed_change: ProposedVendorArrivalChange
