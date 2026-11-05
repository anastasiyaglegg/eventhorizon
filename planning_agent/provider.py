"""Server-side provider boundary and environment-configured HTTP adapters.

The adapters read credentials only at runtime from environment variables and
never include them in returned errors.
"""

import json
import os
import socket
from typing import Any, Iterable, Mapping, Optional, Protocol, Union
from urllib.error import HTTPError, URLError
from urllib.parse import SplitResult, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


ProviderPayload = Union[str, Mapping[str, Any]]

# No provider is implicitly trusted.  Deployment code must pass an explicitly
# approved exact hostname before a configured provider can send a request.
APPROVED_PROVIDER_HOSTNAMES = frozenset()
ANTHROPIC_PROVIDER_HOSTNAMES = frozenset({"api.anthropic.com"})
ANTHROPIC_API_ENDPOINT = "https://api.anthropic.com/v1/messages"
ANTHROPIC_API_VERSION = "2023-06-01"
# Anthropic's current direct API model identifier for Claude Sonnet 5.5.
ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5-5"


class PlanningProvider(Protocol):
    """The narrow server-side interface needed by the Planning Agent."""

    def generate(
        self,
        *,
        instructions: str,
        input_payload: Mapping[str, Any],
        timeout_seconds: float,
    ) -> ProviderPayload:
        """Return raw JSON text or a decoded JSON object."""


class PlanningProviderError(RuntimeError):
    """Base error for provider transport or service failures."""


class PlanningProviderUnavailable(PlanningProviderError):
    """No configured provider is available."""


class PlanningProviderAuthenticationError(PlanningProviderError):
    """The provider rejected authentication without exposing credentials."""


class PlanningProviderTimeout(PlanningProviderError):
    """The provider did not respond within the configured timeout."""


class UnconfiguredPlanningProvider:
    """Explicit provider-independent fallback; it never simulates success."""

    def generate(
        self,
        *,
        instructions: str,
        input_payload: Mapping[str, Any],
        timeout_seconds: float,
    ) -> ProviderPayload:
        raise PlanningProviderUnavailable(
            "No Planning Agent provider is configured."
        )


class _RejectRedirectHandler(HTTPRedirectHandler):
    """Prevent urllib from forwarding a request or credentials elsewhere."""

    def redirect_request(self, request, *args, **kwargs):
        raise PlanningProviderError(
            "Planning provider redirects are not allowed."
        )


def _open_request(request: Request, timeout_seconds: float):
    """Open one request with redirect handling disabled."""

    opener = build_opener(_RejectRedirectHandler())
    return opener.open(request, timeout=timeout_seconds)


def _validated_endpoint(
    endpoint: str,
    approved_hostnames: Iterable[str],
) -> str:
    """Validate an endpoint before a request can be constructed."""

    try:
        parsed: SplitResult = urlsplit(endpoint)
        hostname = parsed.hostname
        port = parsed.port
        username = parsed.username
        password = parsed.password
    except (TypeError, ValueError):
        raise PlanningProviderUnavailable(
            "Planning provider endpoint configuration is invalid."
        )

    try:
        approved = frozenset(
            hostname_value.casefold()
            for hostname_value in approved_hostnames
            if isinstance(hostname_value, str)
        )
    except TypeError:
        raise PlanningProviderUnavailable(
            "Approved provider hostname configuration is invalid."
        )
    if (
        parsed.scheme.casefold() != "https"
        or not hostname
        or hostname.casefold() not in approved
        or username is not None
        or password is not None
        or parsed.query
        or parsed.fragment
        or port not in (None, 443)
    ):
        raise PlanningProviderUnavailable(
            "Planning provider endpoint configuration is not approved."
        )
    return endpoint


class HttpPlanningProvider:
    """A real server-side adapter for an OpenAI-compatible HTTP endpoint."""

    def __init__(
        self,
        endpoint: str,
        api_key: str,
        model: str,
        approved_hostnames: Iterable[str] = APPROVED_PROVIDER_HOSTNAMES,
    ) -> None:
        if not endpoint or not api_key or not model:
            raise PlanningProviderUnavailable(
                "Planning Agent provider configuration is incomplete."
            )
        self._endpoint = _validated_endpoint(endpoint, approved_hostnames)
        self._api_key = api_key
        self._model = model

    @classmethod
    def from_environment(
        cls,
        environ: Optional[Mapping[str, str]] = None,
        approved_hostnames: Iterable[str] = APPROVED_PROVIDER_HOSTNAMES,
    ) -> "HttpPlanningProvider":
        """Create an adapter from runtime environment variables only."""

        values = environ if environ is not None else os.environ
        endpoint = values.get("PLANNING_AGENT_PROVIDER_URL", "")
        api_key = values.get("PLANNING_AGENT_API_KEY", "")
        model = values.get("PLANNING_AGENT_MODEL", "")
        return cls(
            endpoint=endpoint,
            api_key=api_key,
            model=model,
            approved_hostnames=approved_hostnames,
        )

    def generate(
        self,
        *,
        instructions: str,
        input_payload: Mapping[str, Any],
        timeout_seconds: float,
    ) -> ProviderPayload:
        request_body = {
            "model": self._model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": instructions},
                {
                    "role": "user",
                    "content": json.dumps(input_payload, sort_keys=True),
                },
            ],
        }
        request = Request(
            self._endpoint,
            data=json.dumps(request_body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with _open_request(request, timeout_seconds) as response:
                response_body = response.read()
        except HTTPError as error:
            raise PlanningProviderError(
                f"Planning provider returned HTTP status {error.code}."
            ) from error
        except (TimeoutError, socket.timeout) as error:
            raise PlanningProviderTimeout(
                "Planning provider timed out."
            ) from error
        except (URLError, OSError) as error:
            raise PlanningProviderError(
                "Planning provider could not be reached."
            ) from error

        try:
            envelope = json.loads(response_body.decode("utf-8"))
            content = envelope["choices"][0]["message"]["content"]
        except (UnicodeDecodeError, json.JSONDecodeError, KeyError, IndexError, TypeError) as error:
            raise PlanningProviderError(
                "Planning provider returned an invalid response envelope."
            ) from error
        if not isinstance(content, str) or not content.strip():
            raise PlanningProviderError(
                "Planning provider returned empty response content."
            )
        return content


class AnthropicPlanningProvider:
    """A direct server-side adapter for Anthropic's Messages API."""

    def __init__(
        self,
        api_key: str,
        model: str = ANTHROPIC_DEFAULT_MODEL,
        endpoint: str = ANTHROPIC_API_ENDPOINT,
    ) -> None:
        if not api_key or not model:
            raise PlanningProviderUnavailable(
                "Planning Agent provider configuration is incomplete."
            )
        self._endpoint = _validated_endpoint(
            endpoint,
            ANTHROPIC_PROVIDER_HOSTNAMES,
        )
        self._api_key = api_key
        self._model = model

    @classmethod
    def from_environment(
        cls,
        environ: Optional[Mapping[str, str]] = None,
    ) -> "AnthropicPlanningProvider":
        """Create a direct Anthropic adapter from runtime environment values."""

        values = environ if environ is not None else os.environ
        return cls(
            api_key=values.get("ANTHROPIC_API_KEY", ""),
            model=values.get("ANTHROPIC_MODEL", ANTHROPIC_DEFAULT_MODEL),
        )

    def generate(
        self,
        *,
        instructions: str,
        input_payload: Mapping[str, Any],
        timeout_seconds: float,
    ) -> ProviderPayload:
        request_body = {
            "model": self._model,
            "max_tokens": 1024,
            "system": instructions,
            "messages": [
                {
                    "role": "user",
                    "content": json.dumps(input_payload, sort_keys=True),
                }
            ],
        }
        request = Request(
            self._endpoint,
            data=json.dumps(request_body).encode("utf-8"),
            headers={
                "x-api-key": self._api_key,
                "anthropic-version": ANTHROPIC_API_VERSION,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with _open_request(request, timeout_seconds) as response:
                response_body = response.read()
        except HTTPError as error:
            if error.code in (401, 403):
                raise PlanningProviderAuthenticationError(
                    "Anthropic provider authentication failed."
                ) from error
            raise PlanningProviderError(
                f"Anthropic provider returned HTTP status {error.code}."
            ) from error
        except (TimeoutError, socket.timeout) as error:
            raise PlanningProviderTimeout(
                "Planning provider timed out."
            ) from error
        except (URLError, OSError) as error:
            raise PlanningProviderError(
                "Planning provider could not be reached."
            ) from error

        try:
            envelope = json.loads(response_body.decode("utf-8"))
            content = envelope["content"]
            text_blocks = [
                block["text"]
                for block in content
                if isinstance(block, dict)
                and block.get("type") == "text"
                and isinstance(block.get("text"), str)
                and block["text"].strip()
            ]
        except (
            UnicodeDecodeError,
            json.JSONDecodeError,
            KeyError,
            TypeError,
        ) as error:
            raise PlanningProviderError(
                "Anthropic provider returned an invalid response envelope."
            ) from error
        if not text_blocks:
            raise PlanningProviderError(
                "Anthropic provider returned empty response content."
            )
        return "\n".join(text_blocks)
