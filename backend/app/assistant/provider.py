"""LLM provider adapter (ADR-005: integrations are replaceable).

The assistant never talks to a vendor directly. It calls ``LLMProvider.complete`` with a fixed
system prompt and one user message that carries de-identified evidence, and it treats the reply
as an untrusted draft (see validate.py). The model gets no tools, no database access and no
conversation memory.
"""

from dataclasses import dataclass
from typing import Protocol

import httpx

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"


class LLMUnavailable(Exception):  # noqa: N818 - reads better than LLMUnavailableError
    """The provider is not configured, failed, or returned nothing usable."""


@dataclass(frozen=True)
class LLMResult:
    text: str
    model: str
    provider: str


class LLMProvider(Protocol):
    name: str
    configured: bool

    def complete(self, *, system: str, user: str, max_tokens: int) -> LLMResult: ...


class UnconfiguredProvider:
    """Default. Makes the assistant answer in 'evidence only' mode."""

    name = "none"
    configured = False
    model = ""

    def complete(self, *, system: str, user: str, max_tokens: int) -> LLMResult:
        raise LLMUnavailable("No language model is configured.")


class AnthropicProvider:
    name = "anthropic"
    configured = True

    def __init__(self, api_key: str, model: str, timeout: float = 30.0):
        self._key, self.model, self._timeout = api_key, model, timeout

    def complete(self, *, system: str, user: str, max_tokens: int) -> LLMResult:
        try:
            resp = httpx.post(
                ANTHROPIC_URL,
                headers={
                    "x-api-key": self._key,
                    "anthropic-version": ANTHROPIC_VERSION,
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": max_tokens,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
                timeout=self._timeout,
            )
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            # Never include the response body: it can echo the prompt.
            raise LLMUnavailable(f"Provider request failed ({type(exc).__name__}).") from exc
        parts = [
            block.get("text", "")
            for block in data.get("content", [])
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        text = "".join(parts).strip()
        if not text:
            raise LLMUnavailable("Provider returned no text.")
        return LLMResult(text=text, model=str(data.get("model") or self.model), provider=self.name)


def build_provider(settings) -> LLMProvider:
    if settings.llm_provider == "anthropic" and settings.llm_api_key:
        return AnthropicProvider(
            settings.llm_api_key, settings.llm_model, float(settings.llm_timeout_seconds)
        )
    return UnconfiguredProvider()
