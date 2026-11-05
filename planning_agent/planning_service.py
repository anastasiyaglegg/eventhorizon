"""Planning Agent orchestration around the planning.v1 contract."""

import json
from datetime import date, time
from typing import Any, Iterable, Mapping, Optional

from .configuration import (
    ConfigurationError,
    OperationalScenarioConfig,
    compile_operational_scenario,
)
from .models import FrozenEventSnapshot
from .planning_contract import (
    PLANNING_AGENT_INSTRUCTIONS,
    PLANNING_CONTRACT_VERSION,
    PlanningResponseValidationError,
    planning_error_response,
    validate_planning_response,
)
from .provider import (
    APPROVED_PROVIDER_HOSTNAMES,
    AnthropicPlanningProvider,
    PlanningProvider,
    PlanningProviderAuthenticationError,
    PlanningProviderError,
    PlanningProviderTimeout,
    PlanningProviderUnavailable,
    HttpPlanningProvider,
    UnconfiguredPlanningProvider,
)


def _time_value(value: Optional[time]) -> Optional[str]:
    return value.isoformat() if value is not None else None


def _date_value(value: date) -> str:
    return value.isoformat()


def build_planning_input(snapshot: FrozenEventSnapshot) -> dict[str, Any]:
    """Serialize the frozen snapshot into the agreed planning.v1 input."""

    event = snapshot.event
    return {
        "contract_version": PLANNING_CONTRACT_VERSION,
        "snapshot": {
            "event": {
                "name": event.name,
                "event_date": _date_value(event.event_date),
                "start_time": _time_value(event.start_time),
                "vendor": {
                    "vendor_id": event.vendor.vendor_id,
                    "name": event.vendor.name,
                    "arrival_time": _time_value(event.vendor.arrival_time),
                    "setup_duration_minutes": event.vendor.setup_duration_minutes,
                },
                "tasks": [
                    {
                        "task_id": task.task_id,
                        "name": task.name,
                        "start_time": _time_value(task.start_time),
                        "end_time": _time_value(task.end_time),
                    }
                    for task in event.tasks
                ],
            },
            "proposed_change": {
                "vendor_id": snapshot.proposed_change.vendor_id,
                "proposed_arrival_time": _time_value(
                    snapshot.proposed_change.proposed_arrival_time
                ),
            },
        },
    }


class PlanningAgent:
    """Call an injected provider and return only validated planning.v1 data."""

    def __init__(
        self,
        provider: Optional[PlanningProvider] = None,
        timeout_seconds: float = 10.0,
    ) -> None:
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        self._provider = provider or UnconfiguredPlanningProvider()
        self._timeout_seconds = timeout_seconds

    @classmethod
    def from_environment(
        cls,
        *,
        timeout_seconds: float = 10.0,
        environ: Optional[Mapping[str, str]] = None,
        approved_hostnames: Iterable[str] = APPROVED_PROVIDER_HOSTNAMES,
    ) -> "PlanningAgent":
        """Build a server-side agent from runtime provider configuration.

        Missing environment values become the explicit unavailable-provider
        path.  No credential is logged, returned, or embedded in the agent.
        """

        try:
            provider = HttpPlanningProvider.from_environment(
                environ,
                approved_hostnames=approved_hostnames,
            )
        except PlanningProviderUnavailable:
            provider = UnconfiguredPlanningProvider()
        return cls(provider=provider, timeout_seconds=timeout_seconds)

    @classmethod
    def from_anthropic_environment(
        cls,
        *,
        timeout_seconds: float = 10.0,
        environ: Optional[Mapping[str, str]] = None,
    ) -> "PlanningAgent":
        """Build the direct Anthropic-backed agent from runtime values only."""

        try:
            provider = AnthropicPlanningProvider.from_environment(environ)
        except PlanningProviderUnavailable:
            provider = UnconfiguredPlanningProvider()
        return cls(provider=provider, timeout_seconds=timeout_seconds)

    def analyze_configuration(
        self,
        config: OperationalScenarioConfig,
    ) -> dict[str, Any]:
        """Compile a configured scenario, then analyze its frozen snapshot."""

        try:
            compiled = compile_operational_scenario(config)
        except ConfigurationError as error:
            return planning_error_response(
                "invalid_configuration",
                "The operational scenario configuration is invalid.",
                error.errors,
            )
        return self.analyze(compiled.snapshot)

    def analyze(self, snapshot: FrozenEventSnapshot) -> dict[str, Any]:
        """Analyze a snapshot without applying changes or performing time math."""

        input_payload = build_planning_input(snapshot)
        try:
            raw_response = self._provider.generate(
                instructions=PLANNING_AGENT_INSTRUCTIONS,
                input_payload=input_payload,
                timeout_seconds=self._timeout_seconds,
            )
        except PlanningProviderUnavailable:
            return planning_error_response(
                "provider_unavailable",
                "No Planning Agent provider is configured.",
            )
        except PlanningProviderAuthenticationError:
            return planning_error_response(
                "provider_authentication_failed",
                "The Planning Agent provider rejected authentication.",
            )
        except (PlanningProviderTimeout, TimeoutError):
            return planning_error_response(
                "provider_timeout",
                "The Planning Agent provider timed out.",
            )
        except PlanningProviderError:
            return planning_error_response(
                "provider_error",
                "The Planning Agent provider failed.",
            )
        except Exception:
            return planning_error_response(
                "provider_error",
                "The Planning Agent provider failed unexpectedly.",
            )

        if isinstance(raw_response, str):
            try:
                payload: object = json.loads(raw_response)
            except json.JSONDecodeError as error:
                return planning_error_response(
                    "malformed_json",
                    "The Planning Agent provider returned malformed JSON.",
                    (f"JSON parse error at position {error.pos}",),
                )
        elif isinstance(raw_response, Mapping):
            payload = dict(raw_response)
        else:
            return planning_error_response(
                "invalid_response",
                "The Planning Agent provider returned an unsupported response type.",
            )

        try:
            return validate_planning_response(payload, snapshot)
        except PlanningResponseValidationError as error:
            return planning_error_response(error.code, error.message, error.details)
