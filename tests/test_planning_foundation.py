import unittest
from dataclasses import FrozenInstanceError, replace
from datetime import time

from planning_agent.calculations import calculate_setup_overlap
from planning_agent.models import EventTask, ProposedVendorArrivalChange
from planning_agent.sample_event import SAMPLE_EVENT
from planning_agent.snapshot import create_frozen_snapshot


class PlanningFoundationTests(unittest.TestCase):
    def test_snapshot_is_frozen_and_contains_event_and_change(self):
        change = ProposedVendorArrivalChange("caterer-001", time(14, 30))
        snapshot = create_frozen_snapshot(SAMPLE_EVENT, change)

        self.assertEqual(snapshot.event.name, "North Star Product Launch")
        self.assertEqual(snapshot.proposed_change.proposed_arrival_time, time(14, 30))
        with self.assertRaises(FrozenInstanceError):
            snapshot.proposed_change = change

    def test_normal_arrival_has_no_overlap(self):
        change = ProposedVendorArrivalChange("caterer-001", time(14, 30))

        result = calculate_setup_overlap(create_frozen_snapshot(SAMPLE_EVENT, change))

        self.assertEqual(result.status, "no_overlap")
        self.assertEqual(result.setup_start, time(14, 30))
        self.assertEqual(result.setup_end, time(16, 0))
        self.assertEqual(result.overlapping_task_ids, ())

    def test_late_arrival_overlaps_av_line_check(self):
        change = ProposedVendorArrivalChange("caterer-001", time(15, 0))

        result = calculate_setup_overlap(create_frozen_snapshot(SAMPLE_EVENT, change))

        self.assertEqual(result.status, "overlap")
        self.assertEqual(result.overlapping_task_ids, ("av-line-check",))
        self.assertEqual(result.setup_end, time(16, 30))

    def test_late_arrival_reports_all_overlapping_tasks(self):
        change = ProposedVendorArrivalChange("caterer-001", time(15, 45))

        result = calculate_setup_overlap(create_frozen_snapshot(SAMPLE_EVENT, change))

        self.assertEqual(result.status, "overlap")
        self.assertEqual(
            result.overlapping_task_ids,
            ("av-line-check", "guest-check-in"),
        )
        self.assertEqual(result.setup_end, time(17, 15))

    def test_missing_required_timing_returns_unknown(self):
        missing_arrival = ProposedVendorArrivalChange("caterer-001", None)
        arrival_result = calculate_setup_overlap(
            create_frozen_snapshot(SAMPLE_EVENT, missing_arrival)
        )
        self.assertEqual(arrival_result.status, "unknown")

        missing_task = replace(
            SAMPLE_EVENT.tasks[1],
            start_time=None,
        )
        event_with_missing_task_time = replace(
            SAMPLE_EVENT,
            tasks=(
                SAMPLE_EVENT.tasks[0],
                missing_task,
                *SAMPLE_EVENT.tasks[2:],
            ),
        )
        task_result = calculate_setup_overlap(
            create_frozen_snapshot(
                event_with_missing_task_time,
                ProposedVendorArrivalChange("caterer-001", time(14, 30)),
            )
        )
        self.assertEqual(task_result.status, "unknown")
        self.assertIn("missing", task_result.reason or "")
        self.assertEqual(task_result.incomplete_task_ids, ("av-line-check",))

    def test_overlap_and_missing_timing_are_reported_together(self):
        missing_task = replace(
            SAMPLE_EVENT.tasks[0],
            end_time=None,
        )
        event_with_missing_task_time = replace(
            SAMPLE_EVENT,
            tasks=(missing_task, *SAMPLE_EVENT.tasks[1:]),
        )
        result = calculate_setup_overlap(
            create_frozen_snapshot(
                event_with_missing_task_time,
                ProposedVendorArrivalChange("caterer-001", time(15, 45)),
            )
        )

        self.assertEqual(result.status, "overlap")
        self.assertEqual(
            result.overlapping_task_ids,
            ("av-line-check", "guest-check-in"),
        )
        self.assertEqual(result.incomplete_task_ids, ("venue-access",))
        self.assertIn("missing", result.reason or "")


if __name__ == "__main__":
    unittest.main()
