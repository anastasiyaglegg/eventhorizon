import io
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request

from planning_agent.planning_contract import PLANNING_CONTRACT_VERSION
from planning_agent.planning_service import PlanningAgent
from planning_agent.provider import (
    ANTHROPIC_API_ENDPOINT,
    ANTHROPIC_DEFAULT_MODEL,
    ANTHROPIC_PROVIDER_HOSTNAMES,
    AnthropicPlanningProvider,
    HttpPlanningProvider,
    PlanningProviderError,
    PlanningProviderTimeout,
    PlanningProviderUnavailable,
    _RejectRedirectHandler,
)
from planning_agent.sample_event import SAMPLE_EVENT_COMPILED, SAMPLE_EVENT_CONFIGURATION


TEST_ENDPOINT = "https://provider.invalid/v1/chat/completions"
TEST_APPROVED_HOSTNAMES = {"provider.invalid"}


def provider_environment(endpoint=TEST_ENDPOINT):
    return {
        "PLANNING_AGENT_PROVIDER_URL": endpoint,
        "PLANNING_AGENT_API_KEY": "unit-test-placeholder",
        "PLANNING_AGENT_MODEL": "planning-test-model",
    }


def valid_response():
    return {
        "agent": "planning",
        "contract_version": PLANNING_CONTRACT_VERSION,
        "status": "ok",
        "affected_task_ids": ["av-line-check"],
        "scheduling_risks": [
            {
                "type": "potential_schedule_conflict",
                "description": "The proposed arrival may affect the AV line check.",
                "task_ids": ["av-line-check"],
                "evidence": [
                    {"source": "proposed_change", "field": "proposed_arrival_time"},
                    {
                        "source": "vendor",
                        "id": "caterer-001",
                        "field": "setup_duration_minutes",
                    },
                    {
                        "source": "task",
                        "id": "av-line-check",
                        "field": "start_time",
                    },
                ],
            }
        ],
        "unknowns": ["Whether the AV line check can be moved is not confirmed."],
        "recommendation": {
            "action": "Review the AV line check with the coordinator.",
            "task_ids": ["av-line-check"],
        },
    }


class RecordingProvider:
    def __init__(self, response):
        self.response = response
        self.instructions = None
        self.input_payload = None
        self.timeout_seconds = None

    def generate(self, *, instructions, input_payload, timeout_seconds):
        self.instructions = instructions
        self.input_payload = input_payload
        self.timeout_seconds = timeout_seconds
        return self.response


class TimeoutProvider:
    def generate(self, *, instructions, input_payload, timeout_seconds):
        raise PlanningProviderTimeout("simulated transport timeout")


class FailureProvider:
    def generate(self, *, instructions, input_payload, timeout_seconds):
        raise PlanningProviderError("simulated provider failure")


class FakeHttpResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return self.body


class PlanningAgentTests(unittest.TestCase):
    def test_valid_provider_response_is_returned_and_input_is_planning_v1(self):
        provider = RecordingProvider(json.dumps(valid_response()))
        result = PlanningAgent(provider).analyze(SAMPLE_EVENT_COMPILED.snapshot)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(
            provider.input_payload["contract_version"], "planning.v1"
        )
        self.assertEqual(
            provider.input_payload["snapshot"]["event"]["vendor"]["vendor_id"],
            "caterer-001",
        )
        self.assertIn("Never invent", provider.instructions)

    def test_malformed_json_is_reported_as_error(self):
        result = PlanningAgent(RecordingProvider("not json")).analyze(
            SAMPLE_EVENT_COMPILED.snapshot
        )
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error"]["code"], "malformed_json")

    def test_unknown_task_id_is_reported_as_invalid_response(self):
        response = valid_response()
        response["affected_task_ids"] = ["invented-task"]
        result = PlanningAgent(RecordingProvider(response)).analyze(
            SAMPLE_EVENT_COMPILED.snapshot
        )
        self.assertEqual(result["error"]["code"], "invalid_response")
        self.assertTrue(any("unknown task ID" in detail for detail in result["error"]["details"]))

    def test_risk_without_evidence_is_rejected(self):
        response = valid_response()
        response["scheduling_risks"][0]["evidence"] = []
        result = PlanningAgent(RecordingProvider(response)).analyze(
            SAMPLE_EVENT_COMPILED.snapshot
        )
        self.assertEqual(result["error"]["code"], "invalid_response")
        self.assertTrue(any("at least one" in detail for detail in result["error"]["details"]))

    def test_risk_without_evidence_for_its_task_is_rejected(self):
        response = valid_response()
        response["scheduling_risks"][0]["evidence"] = [
            {"source": "proposed_change", "field": "proposed_arrival_time"},
            {"source": "vendor", "id": "caterer-001", "field": "setup_duration_minutes"},
        ]
        result = PlanningAgent(RecordingProvider(response)).analyze(
            SAMPLE_EVENT_COMPILED.snapshot
        )
        self.assertEqual(result["error"]["code"], "invalid_response")
        self.assertTrue(any("lacks task evidence" in detail for detail in result["error"]["details"]))

    def test_malformed_task_ids_are_safe_validation_errors(self):
        response = valid_response()
        response["affected_task_ids"] = [{"not": "a string"}]
        result = PlanningAgent(RecordingProvider(response)).analyze(
            SAMPLE_EVENT_COMPILED.snapshot
        )
        self.assertEqual(result["error"]["code"], "invalid_response")

    def test_malformed_evidence_id_is_safe_validation_error(self):
        response = valid_response()
        response["scheduling_risks"][0]["evidence"][2]["id"] = ["av-line-check"]
        result = PlanningAgent(RecordingProvider(response)).analyze(
            SAMPLE_EVENT_COMPILED.snapshot
        )
        self.assertEqual(result["error"]["code"], "invalid_response")

    def test_missing_evidence_reference_is_reported_as_invalid_response(self):
        response = valid_response()
        response["scheduling_risks"][0]["evidence"][2]["field"] = "unknown_field"
        result = PlanningAgent(RecordingProvider(response)).analyze(
            SAMPLE_EVENT_COMPILED.snapshot
        )
        self.assertEqual(result["error"]["code"], "invalid_response")
        self.assertTrue(any("unsupported" in detail for detail in result["error"]["details"]))

    def test_unsupported_claim_is_rejected(self):
        response = valid_response()
        response["scheduling_risks"][0]["description"] = (
            "The vendor will definitely arrive at 15:00."
        )
        result = PlanningAgent(RecordingProvider(response)).analyze(
            SAMPLE_EVENT_COMPILED.snapshot
        )
        self.assertEqual(result["error"]["code"], "invalid_response")
        self.assertTrue(any("unsupported" in detail for detail in result["error"]["details"]))

    def test_provider_timeout_is_reported_without_simulating_success(self):
        result = PlanningAgent(TimeoutProvider()).analyze(
            SAMPLE_EVENT_COMPILED.snapshot
        )
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error"]["code"], "provider_timeout")

    def test_provider_failure_is_reported_without_exposing_provider_details(self):
        result = PlanningAgent(FailureProvider()).analyze(
            SAMPLE_EVENT_COMPILED.snapshot
        )
        self.assertEqual(result["error"]["code"], "provider_error")
        self.assertNotIn("simulated provider failure", str(result))

    def test_unconfigured_provider_is_explicitly_unavailable(self):
        result = PlanningAgent().analyze(SAMPLE_EVENT_COMPILED.snapshot)
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error"]["code"], "provider_unavailable")

    def test_missing_environment_credentials_are_reported_without_network_access(self):
        agent = PlanningAgent.from_environment(environ={})
        result = agent.analyze_configuration(SAMPLE_EVENT_CONFIGURATION)
        self.assertEqual(result["error"]["code"], "provider_unavailable")

    def test_http_provider_success_uses_mocked_transport_and_planning_contract(self):
        envelope = {
            "choices": [
                {"message": {"content": json.dumps(valid_response())}},
            ],
        }
        provider = HttpPlanningProvider.from_environment(
            provider_environment(),
            approved_hostnames=TEST_APPROVED_HOSTNAMES,
        )
        with patch(
            "planning_agent.provider._open_request",
            return_value=FakeHttpResponse(json.dumps(envelope).encode("utf-8")),
        ) as open_url:
            result = PlanningAgent(provider).analyze_configuration(
                SAMPLE_EVENT_CONFIGURATION
            )

        self.assertEqual(result["status"], "ok")
        request = open_url.call_args.args[0]
        self.assertEqual(request.full_url, TEST_ENDPOINT)
        self.assertEqual(open_url.call_args.args[1], 10.0)
        self.assertIn(b"planning-test-model", request.data)
        self.assertIn(b"Authorization", str(request.headers).encode("utf-8"))

    def test_http_provider_invalid_envelope_is_reported_without_body_leak(self):
        provider = HttpPlanningProvider.from_environment(
            provider_environment(),
            approved_hostnames=TEST_APPROVED_HOSTNAMES,
        )
        with patch(
            "planning_agent.provider._open_request",
            return_value=FakeHttpResponse(b"{\"unexpected\":true}"),
        ):
            result = PlanningAgent(provider).analyze(SAMPLE_EVENT_COMPILED.snapshot)

        self.assertEqual(result["error"]["code"], "provider_error")
        self.assertNotIn("unexpected", str(result))
        self.assertNotIn("unit-test-placeholder", str(result))

    def test_http_provider_timeout_becomes_planning_timeout(self):
        provider = HttpPlanningProvider.from_environment(
            provider_environment(),
            approved_hostnames=TEST_APPROVED_HOSTNAMES,
        )
        with patch(
            "planning_agent.provider._open_request",
            side_effect=TimeoutError(),
        ):
            result = PlanningAgent(provider).analyze(SAMPLE_EVENT_COMPILED.snapshot)

        self.assertEqual(result["error"]["code"], "provider_timeout")

    def test_anthropic_provider_success_uses_direct_messages_api(self):
        envelope = {
            "content": [
                {"type": "text", "text": json.dumps(valid_response())},
            ],
        }
        provider = AnthropicPlanningProvider.from_environment(
            {"ANTHROPIC_API_KEY": "unit-test-placeholder"}
        )
        with patch(
            "planning_agent.provider._open_request",
            return_value=FakeHttpResponse(json.dumps(envelope).encode("utf-8")),
        ) as open_url:
            result = PlanningAgent(provider).analyze_configuration(
                SAMPLE_EVENT_CONFIGURATION
            )

        self.assertEqual(result["status"], "ok")
        request = open_url.call_args.args[0]
        request_body = json.loads(request.data.decode("utf-8"))
        self.assertEqual(request.full_url, ANTHROPIC_API_ENDPOINT)
        self.assertEqual(request_body["model"], ANTHROPIC_DEFAULT_MODEL)
        self.assertEqual(request_body["max_tokens"], 1024)
        self.assertEqual(request.get_header("Anthropic-version"), "2023-06-01")
        self.assertEqual(request.get_header("X-api-key"), "unit-test-placeholder")
        self.assertNotIn("unit-test-placeholder", request.data.decode("utf-8"))

    def test_anthropic_provider_requires_its_exact_approved_hostname(self):
        self.assertEqual(ANTHROPIC_PROVIDER_HOSTNAMES, {"api.anthropic.com"})
        with self.assertRaises(PlanningProviderUnavailable):
            AnthropicPlanningProvider(
                api_key="unit-test-placeholder",
                endpoint="https://api.anthropic.com.evil.invalid/v1/messages",
            )

    def test_anthropic_provider_missing_credentials_is_unavailable(self):
        with self.assertRaises(PlanningProviderUnavailable):
            AnthropicPlanningProvider.from_environment({})

    def test_anthropic_malformed_model_output_is_reported_safely(self):
        envelope = {"content": [{"type": "text", "text": "not json"}]}
        provider = AnthropicPlanningProvider.from_environment(
            {"ANTHROPIC_API_KEY": "unit-test-placeholder"}
        )
        with patch(
            "planning_agent.provider._open_request",
            return_value=FakeHttpResponse(json.dumps(envelope).encode("utf-8")),
        ):
            result = PlanningAgent(provider).analyze(SAMPLE_EVENT_COMPILED.snapshot)

        self.assertEqual(result["error"]["code"], "malformed_json")
        self.assertNotIn("unit-test-placeholder", str(result))

    def test_anthropic_authentication_failure_is_safe(self):
        provider = AnthropicPlanningProvider.from_environment(
            {"ANTHROPIC_API_KEY": "unit-test-placeholder"}
        )
        auth_error = HTTPError(
            ANTHROPIC_API_ENDPOINT,
            401,
            "Unauthorized",
            {},
            io.BytesIO(b"secret-like provider response"),
        )
        with patch(
            "planning_agent.provider._open_request",
            side_effect=auth_error,
        ):
            result = PlanningAgent(provider).analyze(SAMPLE_EVENT_COMPILED.snapshot)

        self.assertEqual(result["error"]["code"], "provider_authentication_failed")
        self.assertNotIn("secret-like provider response", str(result))
        self.assertNotIn("unit-test-placeholder", str(result))

    def test_anthropic_provider_timeout_is_reported(self):
        provider = AnthropicPlanningProvider.from_environment(
            {"ANTHROPIC_API_KEY": "unit-test-placeholder"}
        )
        with patch(
            "planning_agent.provider._open_request",
            side_effect=TimeoutError(),
        ):
            result = PlanningAgent(provider).analyze(SAMPLE_EVENT_COMPILED.snapshot)

        self.assertEqual(result["error"]["code"], "provider_timeout")

    def test_http_provider_requires_https(self):
        with self.assertRaises(PlanningProviderUnavailable):
            HttpPlanningProvider.from_environment(
                provider_environment("http://provider.invalid/v1/chat/completions"),
                approved_hostnames=TEST_APPROVED_HOSTNAMES,
            )

    def test_http_provider_requires_exact_approved_hostname(self):
        with patch("planning_agent.provider._open_request") as open_request:
            with self.assertRaises(PlanningProviderUnavailable):
                HttpPlanningProvider.from_environment(
                    provider_environment("https://unapproved.invalid/v1/chat/completions"),
                    approved_hostnames=TEST_APPROVED_HOSTNAMES,
                )
        open_request.assert_not_called()

    def test_http_provider_rejects_embedded_credentials(self):
        with self.assertRaises(PlanningProviderUnavailable):
            HttpPlanningProvider.from_environment(
                provider_environment(
                    "https://user:password@provider.invalid/v1/chat/completions"
                ),
                approved_hostnames=TEST_APPROVED_HOSTNAMES,
            )

    def test_http_provider_rejects_malformed_or_ambiguous_urls(self):
        for endpoint in (
            "not-a-url",
            "https:///v1/chat/completions",
            "https://provider.invalid:bad/v1/chat/completions",
            "https://provider.invalid/v1/chat/completions?token=embedded",
            "https://provider.invalid/v1/chat/completions#fragment",
        ):
            with self.subTest(endpoint=endpoint):
                with self.assertRaises(PlanningProviderUnavailable):
                    HttpPlanningProvider.from_environment(
                        provider_environment(endpoint),
                        approved_hostnames=TEST_APPROVED_HOSTNAMES,
                    )

    def test_redirect_handler_rejects_redirects_before_forwarding(self):
        handler = _RejectRedirectHandler()
        with self.assertRaises(PlanningProviderError):
            handler.redirect_request(
                Request(TEST_ENDPOINT),
                None,
                302,
                "Found",
                {},
                "https://unapproved.invalid/v1/chat/completions",
            )
