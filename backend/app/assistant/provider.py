"""LLM provider adapters (ADR-005: integrations are replaceable).

The assistant never talks to a vendor directly. It calls ``LLMProvider.complete`` with a fixed
system prompt and one user message that carries de-identified evidence, and it treats the reply
as an untrusted draft (see validate.py). The model gets no tools, no database access and no
conversation memory.

Three wire formats cover the vendors people actually use:

* ``anthropic``         Anthropic Messages API
* ``gemini``            Google Gemini ``generateContent``
* ``openai_compatible`` ``/chat/completions``: OpenAI, NVIDIA NIM (hosted or self-hosted),
                        OpenRouter, Groq, and local servers such as Ollama or vLLM

``LLM_PROVIDER`` names an ordered chain (``gemini,nvidia,openrouter``). ``FailoverProvider`` tries
them in order, skips one that keeps failing for a short cool-down, and records every vendor that
was actually sent the request, because each one is a disclosure of the same evidence.
"""

import ipaddress
import logging
import re
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Protocol
from urllib.parse import urlsplit

import httpx

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

log = logging.getLogger(__name__)

# Reasoning models may emit their working before the answer; it is not part of the answer.
_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


class LLMUnavailable(Exception):  # noqa: N818 - reads better than LLMUnavailableError
    """The provider is not configured, failed, or returned nothing usable."""

    def __init__(self, message: str, attempted: tuple[str, ...] = ()):
        super().__init__(message)
        self.attempted = attempted


@dataclass(frozen=True)
class LLMResult:
    text: str
    model: str
    provider: str
    # Every provider that was sent this request (in order), including ones that then failed.
    attempted: tuple[str, ...] = ()


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


def _clean(text: str) -> str:
    return _THINK.sub("", text).strip()


def _post(provider: str, url: str, headers: dict, body: dict, timeout: float) -> dict:
    try:
        resp = httpx.post(url, headers=headers, json=body, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPStatusError as exc:
        # The status code is safe and is the fastest clue: 401/403 = key, 404 = model name,
        # 429 = quota. Never include the response body or URL: they can echo the prompt or key.
        raise LLMUnavailable(
            f"{provider} request failed (HTTP {exc.response.status_code})."
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise LLMUnavailable(f"{provider} request failed ({type(exc).__name__}).") from exc
    if not isinstance(data, dict):
        raise LLMUnavailable(f"{provider} returned an unexpected response.")
    return data


class AnthropicProvider:
    kind = "anthropic"
    configured = True

    def __init__(self, api_key: str, model: str, timeout: float = 30.0, name: str = "anthropic"):
        self._key, self.model, self._timeout, self.name = api_key, model, timeout, name
        self.host = urlsplit(ANTHROPIC_URL).hostname or ""

    def complete(self, *, system: str, user: str, max_tokens: int) -> LLMResult:
        data = _post(
            self.name,
            ANTHROPIC_URL,
            {
                "x-api-key": self._key,
                "anthropic-version": ANTHROPIC_VERSION,
                "content-type": "application/json",
            },
            {
                "model": self.model,
                "max_tokens": max_tokens,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
            self._timeout,
        )
        parts = [
            block.get("text", "")
            for block in data.get("content", [])
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        text = _clean("".join(parts))
        if not text:
            raise LLMUnavailable(f"{self.name} returned no text.")
        return LLMResult(text, str(data.get("model") or self.model), self.name)


class OpenAICompatibleProvider:
    """``POST {base_url}/chat/completions``: OpenAI, NVIDIA NIM, OpenRouter, Groq, Ollama, vLLM."""

    kind = "openai_compatible"
    configured = True

    def __init__(
        self,
        name: str,
        base_url: str,
        api_key: str | None,
        model: str,
        timeout: float = 30.0,
        extra_headers: dict[str, str] | None = None,
    ):
        self.name, self.model, self._timeout = name, model, timeout
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._headers = {"content-type": "application/json", **(extra_headers or {})}
        if api_key:
            self._headers["authorization"] = f"Bearer {api_key}"
        self.host = urlsplit(base_url).hostname or ""

    def complete(self, *, system: str, user: str, max_tokens: int) -> LLMResult:
        data = _post(
            self.name,
            self._url,
            self._headers,
            {
                "model": self.model,
                "max_tokens": max_tokens,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
            self._timeout,
        )
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMUnavailable(f"{self.name} returned an unexpected response.") from exc
        if isinstance(content, list):  # some servers return content parts
            content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
        text = _clean(content) if isinstance(content, str) else ""
        if not text:
            raise LLMUnavailable(f"{self.name} returned no text.")
        return LLMResult(text, str(data.get("model") or self.model), self.name)


class GeminiProvider:
    kind = "gemini"
    configured = True

    def __init__(
        self,
        name: str,
        api_key: str,
        model: str,
        timeout: float = 30.0,
        base_url: str = GEMINI_BASE,
    ):
        self.name, self.model, self._timeout = name, model, timeout
        self._url = f"{base_url.rstrip('/')}/models/{model}:generateContent"
        # The key travels in a header, never in the URL, so it cannot end up in a log line.
        self._headers = {"x-goog-api-key": api_key, "content-type": "application/json"}
        self.host = urlsplit(base_url).hostname or ""

    def complete(self, *, system: str, user: str, max_tokens: int) -> LLMResult:
        data = _post(
            self.name,
            self._url,
            self._headers,
            {
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": user}]}],
                # Gemini 2.5 models spend output tokens on hidden thinking; without headroom a
                # short budget can come back empty. Length is still steered by the prompt.
                "generationConfig": {"maxOutputTokens": max_tokens + 1024, "temperature": 0.2},
            },
            self._timeout,
        )
        try:
            candidate = data["candidates"][0]
            parts = candidate["content"]["parts"]
        except (KeyError, IndexError, TypeError) as exc:
            # Includes prompt blocked by the vendor's own filters: treated as "no answer".
            raise LLMUnavailable(f"{self.name} returned no answer.") from exc
        text = _clean("".join(p.get("text", "") for p in parts if isinstance(p, dict)))
        if not text:
            raise LLMUnavailable(f"{self.name} returned no text.")
        return LLMResult(text, str(data.get("modelVersion") or self.model), self.name)


# ------------------------------------------------------------------------------------ failover
@dataclass
class _Stats:
    calls: int = 0
    failures: int = 0
    consecutive_failures: int = 0
    last_ok_at: float | None = None  # epoch seconds, for display
    last_error: str | None = None
    cooldown_until: float = 0.0  # monotonic


@dataclass
class ProviderStatus:
    name: str
    kind: str
    model: str
    host: str
    calls: int
    failures: int
    consecutive_failures: int
    cooling_down: bool
    last_ok_at: float | None
    last_error: str | None


@dataclass
class FailoverProvider:
    """Tries each provider in order. After ``failure_threshold`` failures in a row a provider is
    skipped for ``cooldown`` seconds so a dead vendor does not add its timeout to every answer.
    If every provider is cooling down they are all tried anyway: failing fast helps nobody."""

    members: list
    failure_threshold: int = 3
    cooldown: float = 60.0
    clock: Callable[[], float] = time.monotonic
    name: str = "chain"
    configured: bool = True
    _stats: dict[str, _Stats] = field(default_factory=dict, init=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, init=False)

    def __post_init__(self) -> None:
        if not self.members:
            raise ValueError("A provider chain needs at least one provider.")
        self._stats = {m.name: _Stats() for m in self.members}

    @property
    def model(self) -> str:
        return getattr(self.members[0], "model", "")

    def _record(self, name: str, error: str | None) -> None:
        with self._lock:
            st = self._stats[name]
            st.calls += 1
            if error is None:
                st.consecutive_failures, st.last_error = 0, None
                st.last_ok_at, st.cooldown_until = time.time(), 0.0
            else:
                st.failures += 1
                st.consecutive_failures += 1
                st.last_error = error[:200]
                if st.consecutive_failures >= self.failure_threshold:
                    st.cooldown_until = self.clock() + self.cooldown

    def _order(self) -> list:
        now = self.clock()
        with self._lock:
            ready = [m for m in self.members if self._stats[m.name].cooldown_until <= now]
        return ready or list(self.members)

    def complete(self, *, system: str, user: str, max_tokens: int) -> LLMResult:
        attempted: list[str] = []
        for member in self._order():
            attempted.append(member.name)
            try:
                result = member.complete(system=system, user=user, max_tokens=max_tokens)
            except LLMUnavailable as exc:
                self._record(member.name, str(exc))
                # Operators need to see why the assistant fell back; the message is already
                # scrubbed of keys, URLs and prompt text.
                log.warning("llm_provider_failed provider=%s error=%s", member.name, exc)
                continue
            self._record(member.name, None)
            return LLMResult(result.text, result.model, result.provider, tuple(attempted))
        raise LLMUnavailable("Every configured provider failed.", tuple(attempted))

    def test(self, name: str) -> tuple[bool, str | None]:
        """One harmless request to a single named provider, bypassing the chain. Used by admins."""
        member = next((m for m in self.members if m.name == name), None)
        if member is None:
            raise KeyError(name)
        try:
            member.complete(
                system="Reply with the single word OK.", user="Connectivity check.", max_tokens=16
            )
        except LLMUnavailable as exc:
            self._record(name, str(exc))
            return False, str(exc)
        self._record(name, None)
        return True, None

    def status(self) -> list[ProviderStatus]:
        now = self.clock()
        with self._lock:
            return [
                ProviderStatus(
                    name=m.name,
                    kind=getattr(m, "kind", "custom"),
                    model=getattr(m, "model", ""),
                    host=getattr(m, "host", ""),
                    calls=(s := self._stats[m.name]).calls,
                    failures=s.failures,
                    consecutive_failures=s.consecutive_failures,
                    cooling_down=s.cooldown_until > now,
                    last_ok_at=s.last_ok_at,
                    last_error=s.last_error,
                )
                for m in self.members
            ]


# ----------------------------------------------------------------------------- configuration
@dataclass(frozen=True)
class ProviderSpec:
    name: str
    kind: str  # anthropic | gemini | openai_compatible
    model: str
    api_key: str | None
    base_url: str | None = None
    headers: tuple[tuple[str, str], ...] = ()


# name -> (kind, default base URL, extra headers). Keys and models come from settings
# `<name>_api_key`, `<name>_model` and (optionally) `<name>_base_url`.
PRESETS: dict[str, tuple[str, str | None, dict[str, str]]] = {
    "anthropic": ("anthropic", None, {}),
    "gemini": ("gemini", GEMINI_BASE, {}),
    "nvidia": ("openai_compatible", "https://integrate.api.nvidia.com/v1", {}),
    "openrouter": (
        "openai_compatible",
        "https://openrouter.ai/api/v1",
        {"X-Title": "MediCare AI"},
    ),
    "openai": ("openai_compatible", "https://api.openai.com/v1", {}),
    "groq": ("openai_compatible", "https://api.groq.com/openai/v1", {}),
}
KINDS = {"anthropic", "gemini", "openai_compatible"}
_NAME = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")
_LOCAL_HOSTS = {"localhost", "host.docker.internal"}


def _is_local(host: str) -> bool:
    if host in _LOCAL_HOSTS:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def check_base_url(name: str, url: str, *, production: bool) -> str:
    """Admin-supplied endpoints must be https (plain http only for this machine), carry no
    credentials or query, so a key cannot travel in the clear or leak through a URL."""
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise ValueError(f"{name}: base URL must be an http(s) URL")
    if parts.username or parts.password or parts.query or parts.fragment:
        raise ValueError(f"{name}: base URL must not contain credentials, a query or a fragment")
    if parts.scheme == "http" and not _is_local(parts.hostname):
        raise ValueError(f"{name}: base URL must use https (http is allowed only for localhost)")
    if production and parts.scheme == "http" and not _is_local(parts.hostname):
        raise ValueError(f"{name}: https is required in production")
    return url.rstrip("/")


def resolve_specs(settings) -> list[ProviderSpec]:
    """Turn settings into an ordered, validated provider list. Raises ValueError (so the app
    refuses to start) on an unknown name, a missing key, a missing model or an unsafe URL."""
    chain = [n.strip().lower() for n in settings.llm_provider.split(",") if n.strip()]
    if not chain or chain == ["none"]:
        return []
    if "none" in chain:
        raise ValueError("LLM_PROVIDER cannot mix 'none' with provider names")
    if len(set(chain)) != len(chain):
        raise ValueError("LLM_PROVIDER lists the same provider twice")
    custom: dict[str, dict] = {}
    for entry in settings.llm_custom_providers:
        name = str(entry.get("name", "")).lower()
        if not _NAME.match(name):
            raise ValueError("Custom provider names use lowercase letters, digits, '-' or '_'")
        if name in PRESETS or name in custom or name == "none":
            raise ValueError(f"Custom provider name '{name}' is already taken")
        custom[name] = entry
    production = settings.environment == "production"
    specs: list[ProviderSpec] = []
    for name in chain:
        if name in PRESETS:
            kind, default_url, headers = PRESETS[name]
            key = (
                settings.llm_api_key or getattr(settings, "anthropic_api_key", None)
                if name == "anthropic"
                else getattr(settings, f"{name}_api_key", None)
            )
            model = (
                settings.llm_model if name == "anthropic" else getattr(settings, f"{name}_model")
            )
            url = getattr(settings, f"{name}_base_url", None) or default_url
        elif name in custom:
            e = custom[name]
            kind = str(e.get("kind", "openai_compatible"))
            key, model = e.get("api_key") or None, str(e.get("model") or "")
            url, headers = e.get("base_url"), {}
            if kind not in KINDS:
                raise ValueError(f"{name}: kind must be one of {sorted(KINDS)}")
            if kind == "openai_compatible" and not url:
                raise ValueError(f"{name}: base_url is required for openai_compatible")
        else:
            known = ", ".join(sorted(PRESETS) + sorted(custom))
            raise ValueError(f"Unknown LLM provider '{name}'. Known: {known}")
        if not model:
            raise ValueError(f"{name}: a model name is required")
        if url:
            url = check_base_url(name, url, production=production)
        local = bool(url) and _is_local(urlsplit(url).hostname or "")
        if not key and not (kind == "openai_compatible" and local):
            raise ValueError(f"{name}: an API key is required (set {name.upper()}_API_KEY)")
        specs.append(ProviderSpec(name, kind, model, key, url, tuple(headers.items())))
    return specs


def _build_one(spec: ProviderSpec, timeout: float):
    if spec.kind == "anthropic":
        return AnthropicProvider(spec.api_key or "", spec.model, timeout, spec.name)
    if spec.kind == "gemini":
        return GeminiProvider(
            spec.name, spec.api_key or "", spec.model, timeout, spec.base_url or GEMINI_BASE
        )
    return OpenAICompatibleProvider(
        spec.name,
        spec.base_url or "",
        spec.api_key,
        spec.model,
        timeout,
        dict(spec.headers),
    )


def build_provider(settings) -> LLMProvider:
    specs = resolve_specs(settings)
    if not specs:
        return UnconfiguredProvider()
    timeout = float(settings.llm_timeout_seconds)
    members = [_build_one(s, timeout) for s in specs]
    # A chain of one is still wrapped, so status, cool-down and the admin test work the same.
    return FailoverProvider(
        members,
        failure_threshold=settings.llm_failure_threshold,
        cooldown=float(settings.llm_cooldown_seconds),
    )
