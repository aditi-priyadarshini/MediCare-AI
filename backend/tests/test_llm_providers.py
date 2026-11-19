"""Multi-provider AI: wire formats, failover, configuration, disclosure logging, admin view."""

import httpx
import pytest
from sqlalchemy import select, update

from app.assistant import provider as P
from app.assistant.models import ChatContextAccessLog
from app.core.config import Settings
from app.identity.models import User
from tests.conftest import TEST_DB_URL

KEY = "fake-key-SECRET-VALUE-123456789012345"


class FakeHttp:
    """Stands in for httpx.post: returns queued responses (dict) or raises (Exception)."""

    def __init__(self):
        self.queue: list = []
        self.calls: list[dict] = []

    def __call__(self, url, headers=None, json=None, timeout=None):
        self.calls.append({"url": url, "headers": headers, "json": json})
        item = self.queue.pop(0)
        if isinstance(item, Exception):
            raise item
        req = httpx.Request("POST", url)
        return httpx.Response(item.get("_status", 200), json=item, request=req)


@pytest.fixture
def http(monkeypatch):
    fake = FakeHttp()
    monkeypatch.setattr(P.httpx, "post", fake)
    return fake


def ask(provider):
    return provider.complete(system="SYS", user="USER", max_tokens=100)


# ------------------------------------------------------------------------------ wire formats
def test_openai_compatible_request_and_parse(http):
    http.queue.append({"model": "m-1", "choices": [{"message": {"content": "Hello [E1]"}}]})
    p = P.OpenAICompatibleProvider("nvidia", "https://integrate.api.nvidia.com/v1/", KEY, "m")
    r = ask(p)
    call = http.calls[0]
    assert call["url"] == "https://integrate.api.nvidia.com/v1/chat/completions"
    assert call["headers"]["authorization"] == f"Bearer {KEY}"
    assert call["json"]["messages"] == [
        {"role": "system", "content": "SYS"},
        {"role": "user", "content": "USER"},
    ]
    assert (r.text, r.model, r.provider) == ("Hello [E1]", "m-1", "nvidia")


def test_openai_compatible_strips_reasoning_and_handles_parts(http):
    http.queue.append(
        {"choices": [{"message": {"content": "<think>plan\nmore</think>\nAnswer [E1]"}}]}
    )
    http.queue.append(
        {
            "choices": [
                {"message": {"content": [{"type": "text", "text": "Part A "}, {"text": "B"}]}}
            ]
        }
    )
    p = P.OpenAICompatibleProvider("openrouter", "https://openrouter.ai/api/v1", KEY, "m")
    assert ask(p).text == "Answer [E1]"
    assert ask(p).text == "Part A B"


def test_local_server_needs_no_key(http):
    http.queue.append({"choices": [{"message": {"content": "ok"}}]})
    ask(P.OpenAICompatibleProvider("local", "http://localhost:11434/v1", None, "llama"))
    assert "authorization" not in http.calls[0]["headers"]


def test_gemini_request_keeps_key_out_of_url(http):
    http.queue.append(
        {
            "modelVersion": "g-2",
            "candidates": [{"content": {"parts": [{"text": "Hi "}, {"text": "there"}]}}],
        }
    )
    r = ask(P.GeminiProvider("gemini", KEY, "gemini-2.5-flash"))
    call = http.calls[0]
    assert call["url"].endswith("/models/gemini-2.5-flash:generateContent")
    assert KEY not in call["url"] and call["headers"]["x-goog-api-key"] == KEY
    assert call["json"]["systemInstruction"]["parts"][0]["text"] == "SYS"
    assert call["json"]["contents"][0]["parts"][0]["text"] == "USER"
    assert call["json"]["generationConfig"]["maxOutputTokens"] > 100  # headroom for thinking
    assert (r.text, r.model) == ("Hi there", "g-2")


def test_gemini_blocked_prompt_is_unavailable(http):
    http.queue.append({"promptFeedback": {"blockReason": "SAFETY"}})
    with pytest.raises(P.LLMUnavailable):
        ask(P.GeminiProvider("gemini", KEY, "m"))


def test_anthropic_still_works(http):
    http.queue.append({"model": "c", "content": [{"type": "text", "text": "Yes"}]})
    r = ask(P.AnthropicProvider(KEY, "claude-x"))
    assert http.calls[0]["headers"]["x-api-key"] == KEY and r.text == "Yes"


@pytest.mark.parametrize(
    "provider",
    [
        P.AnthropicProvider(KEY, "m"),
        P.GeminiProvider("gemini", KEY, "m"),
        P.OpenAICompatibleProvider("x", "https://example.com/v1", KEY, "m"),
    ],
)
def test_failures_never_leak_key_or_body(http, provider):
    for bad in (
        httpx.ConnectError("boom " + KEY),
        {"_status": 500, "error": "echoed " + KEY + " prompt USER"},
        {"unexpected": True},
        {"choices": [], "candidates": [], "content": []},
    ):
        http.queue.append(bad)
        with pytest.raises(P.LLMUnavailable) as err:
            ask(provider)
        assert KEY not in str(err.value) and "USER" not in str(err.value)


# ------------------------------------------------------------------------------- failover
class Scripted:
    kind = "test"
    host = "test.invalid"
    model = "m"
    configured = True

    def __init__(self, name, *replies):
        self.name, self.replies, self.calls = name, list(replies), 0

    def complete(self, *, system, user, max_tokens):
        self.calls += 1
        reply = self.replies.pop(0) if self.replies else "default"
        if isinstance(reply, Exception):
            raise reply
        return P.LLMResult(reply, "m", self.name)


FAIL = P.LLMUnavailable("down")


def test_failover_uses_first_healthy_and_reports_every_vendor_contacted():
    a, b, c = Scripted("a", FAIL), Scripted("b", "from b"), Scripted("c")
    r = ask(P.FailoverProvider([a, b, c]))
    assert r.provider == "b" and r.text == "from b"
    assert r.attempted == ("a", "b") and c.calls == 0  # c never saw the evidence


def test_all_failing_raises_with_the_list_of_vendors_contacted():
    chain = P.FailoverProvider([Scripted("a", FAIL), Scripted("b", FAIL)])
    with pytest.raises(P.LLMUnavailable) as err:
        ask(chain)
    assert err.value.attempted == ("a", "b")


def test_cooldown_skips_a_dead_provider_then_recovers():
    now = [0.0]
    a, b = Scripted("a", FAIL, FAIL, FAIL), Scripted("b")
    chain = P.FailoverProvider([a, b], failure_threshold=3, cooldown=60, clock=lambda: now[0])
    for _ in range(3):
        assert ask(chain).provider == "b"
    assert a.calls == 3 and chain.status()[0].cooling_down
    assert ask(chain).attempted == ("b",) and a.calls == 3  # skipped, no wasted timeout
    now[0] = 61
    assert ask(chain).provider == "a" and a.calls == 4  # tried again and succeeded
    assert not chain.status()[0].cooling_down and chain.status()[0].consecutive_failures == 0


def test_if_every_provider_is_cooling_down_they_are_tried_anyway():
    a = Scripted("a", FAIL, "back")
    chain = P.FailoverProvider([a], failure_threshold=1, cooldown=999, clock=lambda: 0.0)
    with pytest.raises(P.LLMUnavailable):
        ask(chain)
    assert ask(chain).text == "back"


def test_status_exposes_no_secrets(http):
    chain = P.FailoverProvider([P.GeminiProvider("gemini", KEY, "m")])
    assert KEY not in repr(chain.status())


# ----------------------------------------------------------------------------- configuration
def cfg(**kw) -> Settings:
    return Settings(environment="test", database_url=TEST_DB_URL, **kw)


def test_default_is_unconfigured():
    assert isinstance(P.build_provider(cfg()), P.UnconfiguredProvider)


def test_ordered_chain_from_settings():
    s = cfg(
        llm_provider="gemini, nvidia ,openrouter",
        gemini_api_key=KEY,
        gemini_model="g",
        nvidia_api_key=KEY,
        nvidia_model="n",
        openrouter_api_key=KEY,
        openrouter_model="o",
    )
    chain = P.build_provider(s)
    assert [m.name for m in chain.members] == ["gemini", "nvidia", "openrouter"]
    assert [m.kind for m in chain.members] == ["gemini", "openai_compatible", "openai_compatible"]
    assert chain.members[1].host == "integrate.api.nvidia.com"


def test_comma_separated_models_become_ordered_fallbacks():
    s = cfg(
        llm_provider="gemini,openrouter",
        gemini_api_key=KEY,
        gemini_model=" gemini-a , gemini-b,gemini-c ",
        openrouter_api_key=KEY,
        openrouter_model="o",
    )
    chain = P.build_provider(s)
    assert [m.name for m in chain.members] == ["gemini", "gemini-2", "gemini-3", "openrouter"]
    assert [m.model for m in chain.members] == ["gemini-a", "gemini-b", "gemini-c", "o"]
    with pytest.raises(ValueError, match="twice"):
        P.build_provider(cfg(llm_provider="gemini", gemini_api_key=KEY, gemini_model="a,a"))


def test_legacy_anthropic_settings_still_work():
    chain = P.build_provider(cfg(llm_provider="anthropic", llm_api_key=KEY))
    assert chain.members[0].name == "anthropic"


def test_self_hosted_nim_and_custom_providers():
    s = cfg(
        llm_provider="nvidia,local",
        nvidia_api_key=KEY,
        nvidia_base_url="http://localhost:8000/v1",
        llm_custom_providers=[
            {"name": "local", "base_url": "http://127.0.0.1:11434/v1", "model": "llama3.1"},
        ],
    )
    chain = P.build_provider(s)
    assert chain.members[0].host == "localhost" and chain.members[1].host == "127.0.0.1"


@pytest.mark.parametrize(
    "kw, message",
    [
        ({"llm_provider": "gemini"}, "API key is required"),
        ({"llm_provider": "mystery"}, "Unknown LLM provider"),
        ({"llm_provider": "none,gemini", "gemini_api_key": KEY}, "cannot mix"),
        ({"llm_provider": "gemini,gemini", "gemini_api_key": KEY}, "twice"),
        (
            {
                "llm_provider": "nvidia",
                "nvidia_api_key": KEY,
                "nvidia_base_url": "http://evil.example/v1",
            },
            "https",
        ),
        (
            {
                "llm_provider": "nvidia",
                "nvidia_api_key": KEY,
                "nvidia_base_url": "https://u:p@x.example/v1",
            },
            "credentials",
        ),
        (
            {
                "llm_provider": "nvidia",
                "nvidia_api_key": KEY,
                "nvidia_base_url": "https://x.example/v1?key=1",
            },
            "query",
        ),
        ({"llm_provider": "gemini", "gemini_api_key": KEY, "gemini_model": ""}, "model"),
        (
            {"llm_provider": "x", "llm_custom_providers": [{"name": "x", "model": "m"}]},
            "base_url is required",
        ),
        (
            {
                "llm_provider": "x",
                "llm_custom_providers": [
                    {"name": "gemini", "model": "m", "base_url": "https://a.example"}
                ],
            },
            "already taken",
        ),
        (
            {
                "llm_provider": "x",
                "llm_custom_providers": [{"name": "x", "kind": "weird", "model": "m"}],
            },
            "kind",
        ),
    ],
)
def test_bad_configuration_refuses_to_start(kw, message):
    with pytest.raises(ValueError, match=message):
        cfg(**kw)


# --------------------------------------------------------- through the real assistant and admin
@pytest.fixture
def chained_app(app):
    a, b = Scripted("gemini", FAIL), Scripted("nvidia", "Your allergy list has one entry [E1].")
    app.state.llm = P.FailoverProvider([a, b])
    return app, a, b


def promote(db, actor):
    db.execute(update(User).where(User.email == actor.email).values(role="admin"))
    db.commit()


def test_disclosure_log_names_every_vendor_that_received_the_evidence(chained_app, make_actor, db):
    app, a, b = chained_app
    actor = make_actor("pat@example.com")
    assert actor.put("/consents/ai_context", json={"granted": True}).status_code == 200
    actor.post("/allergies", json={"substance": "Penicillin", "reaction": "Rash"})
    chat = actor.post("/assistant/sessions", json={"context": {"allergies": True}}).json()
    resp = actor.post(
        f"/assistant/sessions/{chat['id']}/messages", json={"content": "What is on my list?"}
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["assistant_message"]["safety_classification"] == "answered"
    log = db.scalars(select(ChatContextAccessLog)).all()
    assert [row.provider for row in log] == ["gemini,nvidia"]  # both saw it; the first failed
    assert (a.calls, b.calls) == (1, 1)


def test_all_providers_down_falls_back_to_the_records_and_still_logs_who_was_contacted(
    chained_app, make_actor, db
):
    app, a, b = chained_app
    b.replies = [FAIL]
    actor = make_actor("pat2@example.com")
    actor.put("/consents/ai_context", json={"granted": True})
    actor.post("/allergies", json={"substance": "Penicillin", "reaction": "Rash"})
    chat = actor.post("/assistant/sessions", json={"context": {"allergies": True}}).json()
    resp = actor.post(
        f"/assistant/sessions/{chat['id']}/messages", json={"content": "What is on my list?"}
    )
    assert resp.json()["assistant_message"]["safety_classification"] == "fallback"
    assert [r.provider for r in db.scalars(select(ChatContextAccessLog))] == ["gemini,nvidia"]


def test_admin_lists_providers_and_tests_one(chained_app, make_actor, db):
    boss = make_actor("llm-boss@example.com")
    promote(db, boss)
    listing = boss.get("/admin/llm/providers").json()
    assert listing["configured"] and [p["name"] for p in listing["providers"]] == [
        "gemini",
        "nvidia",
    ]
    assert boss.post("/admin/llm/providers/nvidia/test").json()["ok"] is True
    bad = boss.post("/admin/llm/providers/gemini/test").json()
    assert bad["ok"] is False and "down" in bad["error"]
    assert boss.post("/admin/llm/providers/nope/test").status_code == 404
    assert boss.get("/admin/llm/providers").json()["providers"][0]["failures"] == 1


def test_admin_view_for_an_unconfigured_assistant(make_actor, db):
    boss = make_actor("llm-boss2@example.com")
    promote(db, boss)
    assert boss.get("/admin/llm/providers").json() == {"configured": False, "providers": []}


def test_patient_cannot_see_or_test_providers(chained_app, make_actor):
    pat = make_actor("nosy@example.com")
    assert pat.get("/admin/llm/providers").status_code == 403
    assert pat.post("/admin/llm/providers/gemini/test").status_code == 403


def test_status_endpoint_lists_the_chain(chained_app, make_actor):
    pat = make_actor("status@example.com")
    s = pat.get("/assistant/status").json()
    assert s["mode"] == "llm" and s["provider"] == "gemini,nvidia"


# --- a vendor's odd reply must never escape as an exception (it used to become a 500) -------
@pytest.mark.parametrize(
    "body",
    [
        {"candidates": [{"content": {"parts": [{"text": None}]}}]},
        {"choices": [{"message": {"content": [{"text": None}]}}]},
        {"content": [{"type": "text", "text": None}]},
    ],
)
def test_null_text_in_a_reply_is_a_provider_failure_not_a_crash(monkeypatch, body):
    import httpx

    from app.assistant import provider as P

    monkeypatch.setattr(
        P.httpx,
        "post",
        lambda url, **k: httpx.Response(200, json=body, request=httpx.Request("POST", url)),
    )
    chain = P.FailoverProvider(
        [
            P.GeminiProvider("gemini", "k", "m"),
            P.OpenAICompatibleProvider("nvidia", "https://x.test/v1", "k", "m"),
            P.AnthropicProvider("k", "m"),
        ]
    )
    with pytest.raises(P.LLMUnavailable) as err:
        chain.complete(system="s", user="u", max_tokens=10)
    assert err.value.attempted == ("gemini", "nvidia", "anthropic")


def test_an_unexpected_exception_from_a_member_falls_through_to_the_next():
    from app.assistant import provider as P

    class Boom:
        name, model, configured = "boom", "m", True

        def complete(self, **_):
            raise RuntimeError("anything at all")

    class Good(Boom):
        name = "good"

        def complete(self, **_):
            return P.LLMResult("fine", "m", "good")

    out = P.FailoverProvider([Boom(), Good()]).complete(system="s", user="u", max_tokens=5)
    assert out.text == "fine" and out.attempted == ("boom", "good")
