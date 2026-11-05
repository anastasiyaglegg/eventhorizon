import unittest
import json
import threading
from datetime import time
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from planning_agent.sample_event import SAMPLE_EVENT
from planning_agent.provider import PlanningProviderError
from planning_preview import PreviewSession, analyze_preview
from preview_server import PreviewHandler


class InvalidResponseProvider:
    def generate(self, *, instructions, input_payload, timeout_seconds):
        return "{}"


class FailedProvider:
    def generate(self, *, instructions, input_payload, timeout_seconds):
        raise PlanningProviderError("provider detail must stay private")


class PlanningPreviewTests(unittest.TestCase):
    def test_normal_arrival_is_preview_only_and_does_not_change_event(self):
        result = analyze_preview("14:30")

        self.assertEqual(result["status"], "ok")
        self.assertTrue(result["preview_only"])
        self.assertTrue(result["simulated"])
        self.assertEqual(result["overlap"]["status"], "no_overlap")
        self.assertEqual(result["planning"]["affected_task_ids"], [])
        self.assertEqual(SAMPLE_EVENT.vendor.arrival_time, time(14, 30))

    def test_late_arrival_shows_exact_overlap_and_planning_evidence(self):
        result = analyze_preview("15:45")

        self.assertEqual(result["overlap"]["status"], "overlap")
        self.assertEqual(result["overlap"]["setup_start"], "15:45:00")
        self.assertEqual(result["overlap"]["setup_end"], "17:15:00")
        self.assertEqual(
            result["overlap"]["overlapping_task_ids"],
            ["av-line-check", "guest-check-in"],
        )
        self.assertEqual(
            result["planning"]["affected_task_ids"],
            ["av-line-check", "guest-check-in"],
        )
        evidence = result["planning"]["scheduling_risks"][0]["evidence"]
        self.assertIn(
            {"source": "task", "id": "av-line-check", "field": "start_time"},
            evidence,
        )
        self.assertEqual(SAMPLE_EVENT.vendor.arrival_time, time(14, 30))

    def test_missing_arrival_reports_unknown_without_inventing_time(self):
        result = analyze_preview("")

        self.assertEqual(result["overlap"]["status"], "unknown")
        self.assertIsNone(result["overlap"]["setup_start"])
        self.assertIsNone(result["overlap"]["setup_end"])
        self.assertEqual(result["overlap"]["overlapping_task_ids"], [])
        self.assertTrue(result["planning"]["unknowns"])
        self.assertIn(
            "missing or uncertain timing",
            result["planning"]["recommendation"]["action"],
        )
        self.assertIsNone(result["event"]["vendor"]["proposed_arrival_time"])
        self.assertEqual(SAMPLE_EVENT.vendor.arrival_time, time(14, 30))

    def test_offset_qualified_arrival_is_rejected_without_server_crash(self):
        for invalid in ("15:45+02:00", "15:45:00Z", "15:45:00+02:00", "15:45:00.000", "25:00"):
            with self.subTest(invalid=invalid):
                result = analyze_preview(invalid)
                self.assertEqual(result["status"], "error")
                self.assertEqual(result["error"]["code"], "invalid_arrival_time")

    def test_late_arrival_provides_deterministic_overlap_minutes(self):
        result = analyze_preview("15:45")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["overlap"]["overlap_minutes_by_task"], [
            {"task_id": "av-line-check", "minutes": 30},
            {"task_id": "guest-check-in", "minutes": 15},
        ])
        self.assertEqual(result["overlap"]["setup_minutes_after_event_start"], 0)

    def test_late_arrival_past_event_start_calculates_30_minutes(self):
        result = analyze_preview("17:00")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["overlap"]["setup_minutes_after_event_start"], 30)
        self.assertIn(
            {"task_id": "doors-open", "minutes": 30},
            result["overlap"]["overlap_minutes_by_task"],
        )

    def test_missing_arrival_keeps_duration_unknown(self):
        result = analyze_preview("")
        self.assertIsNone(result["overlap"]["setup_minutes_after_event_start"])
        self.assertEqual(result["overlap"]["overlap_minutes_by_task"], [])

    def test_review_screen_reports_before_and_after_deterministic_impacts(self):
        result = analyze_preview("15:45")

        review = result["review"]
        self.assertEqual(review["original_arrival_time"], "14:30:00")
        self.assertEqual(review["proposed_arrival_time"], "15:45:00")
        self.assertEqual(review["original"]["overlapping_task_ids"], [])
        self.assertEqual(
            review["proposed"]["overlapping_task_ids"],
            ["av-line-check", "guest-check-in"],
        )
        impacts = {item["task_id"]: item for item in review["task_impacts"]}
        self.assertEqual(impacts["av-line-check"]["original_overlap_minutes"], 0.0)
        self.assertEqual(impacts["av-line-check"]["proposed_overlap_minutes"], 30.0)
        self.assertEqual(impacts["guest-check-in"]["proposed_overlap_minutes"], 15.0)
        self.assertEqual(review["proposed"]["setup_minutes_after_event_start"], 0)
        self.assertEqual(SAMPLE_EVENT.vendor.arrival_time, time(14, 30))

    def test_review_screen_does_not_invent_proposed_overlap_when_arrival_is_missing(self):
        result = analyze_preview("")

        review = result["review"]
        self.assertEqual(review["proposed"]["status"], "unknown")
        self.assertIsNone(review["proposed"]["setup_start"])
        self.assertTrue(
            all(item["proposed_overlap_minutes"] is None for item in review["task_impacts"])
        )
        self.assertEqual(SAMPLE_EVENT.vendor.arrival_time, time(14, 30))

    def test_review_screen_keeps_future_boundaries_disconnected(self):
        html = Path("preview/index.html").read_text(encoding="utf-8")

        self.assertIn("Review proposed change", html)
        self.assertIn("Explicitly dependent scheduled tasks", html)
        self.assertIn("scheduling_risks", html)
        self.assertIn("Readiness findings", html)
        self.assertIn("Vendor Follow-up draft", html)
        self.assertIn("Approve proposed arrival", html)
        self.assertIn("Reject proposed change", html)
        self.assertIn('id="approve"', html)
        self.assertIn('id="reject"', html)
        self.assertIn("disabled", html)
        self.assertIn("Application-calculated", html)
        self.assertIn("One simulated AI call · planning.v1", html)

    def test_approve_updates_only_the_local_session_event(self):
        session = PreviewSession()

        result = analyze_preview("17:00", session=session)
        decision = session.decide("approve")

        self.assertTrue(result["approval"]["can_approve"])
        self.assertEqual(decision["decision"], "approved")
        self.assertTrue(decision["event_changed"])
        self.assertEqual(session.event.vendor.arrival_time, time(17, 0))
        self.assertEqual(SAMPLE_EVENT.vendor.arrival_time, time(14, 30))

        current = analyze_preview("", session=session)
        self.assertEqual(
            current["event"]["vendor"]["original_arrival_time"],
            "17:00:00",
        )

    def test_reject_preserves_the_local_session_event_arrival(self):
        session = PreviewSession()

        analyze_preview("17:00", session=session)
        decision = session.decide("reject")

        self.assertEqual(decision["decision"], "rejected")
        self.assertFalse(decision["event_changed"])
        self.assertEqual(session.event.vendor.arrival_time, time(14, 30))
        self.assertEqual(SAMPLE_EVENT.vendor.arrival_time, time(14, 30))

    def test_missing_arrival_blocks_approval(self):
        session = PreviewSession()

        result = analyze_preview("", session=session)
        decision = session.decide("approve")

        self.assertFalse(result["approval"]["can_approve"])
        self.assertEqual(decision["error"]["code"], "approval_blocked")
        self.assertEqual(session.event.vendor.arrival_time, time(14, 30))

    def test_invalid_ai_output_blocks_approval_with_recoverable_error(self):
        session = PreviewSession()

        result = analyze_preview("17:00", session=session, provider=InvalidResponseProvider())
        decision = session.decide("approve")

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error"]["code"], "invalid_response")
        self.assertFalse(result["approval"]["can_approve"])
        self.assertEqual(decision["error"]["code"], "approval_blocked")
        self.assertEqual(session.event.vendor.arrival_time, time(14, 30))

    def test_provider_failure_blocks_approval_without_exposing_details(self):
        session = PreviewSession()

        result = analyze_preview("17:00", session=session, provider=FailedProvider())
        decision = session.decide("approve")

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error"]["code"], "provider_error")
        self.assertNotIn("provider detail must stay private", str(result))
        self.assertEqual(decision["error"]["code"], "approval_blocked")

    def test_http_boundary_rejects_timezone_offset_with_400(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), PreviewHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            request = Request(
                f"http://127.0.0.1:{server.server_port}/api/preview",
                data=json.dumps({"proposed_arrival_time": "15:45:00+02:00"}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(HTTPError) as caught:
                urlopen(request, timeout=3)
            self.assertEqual(caught.exception.code, 400)
            result = json.loads(caught.exception.read().decode())
            self.assertEqual(result["error"]["code"], "invalid_arrival_time")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)

    def test_invalid_arrival_is_rejected_without_guessing(self):
        result = analyze_preview("not-a-time")

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error"]["code"], "invalid_arrival_time")


if __name__ == "__main__":
    unittest.main()
