"""Creation of the immutable handoff between event data and future AI logic."""

from .models import Event, FrozenEventSnapshot, ProposedVendorArrivalChange


def create_frozen_snapshot(
    event: Event,
    proposed_change: ProposedVendorArrivalChange,
) -> FrozenEventSnapshot:
    """Create a read-only snapshot of the event and proposed change.

    The domain models are frozen dataclasses and event tasks are stored as a
    tuple, so the returned snapshot cannot be changed in place by agent code.
    """

    return FrozenEventSnapshot(event=event, proposed_change=proposed_change)
