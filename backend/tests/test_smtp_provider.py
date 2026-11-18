"""SMTP delivery: login + TLS modes (Zoho). No network: smtplib is replaced by a recorder."""

import pytest

from app.core.config import Settings
from app.identity import providers
from app.identity.providers import SmtpEmailProvider

SECRET = "x" * 40


class FakeSMTP:
    instances: list["FakeSMTP"] = []

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port, self.context = host, port, context
        self.calls: list[tuple] = []
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        self.calls.append(("starttls",))

    def login(self, user, password):
        self.calls.append(("login", user, password))

    def send_message(self, msg):
        self.calls.append(("send", msg["From"], msg["To"], msg["Subject"]))


@pytest.fixture(autouse=True)
def fake_smtp(monkeypatch):
    FakeSMTP.instances.clear()
    monkeypatch.setattr(providers.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(providers.smtplib, "SMTP_SSL", FakeSMTP)


def test_zoho_ssl_logs_in_then_sends():
    p = SmtpEmailProvider(
        "smtp.zoho.in", 465, "MediCare AI <no-reply@x.com>", "no-reply@x.com", "app-pw", "ssl"
    )
    p.send("a@b.com", "Hi", "body")
    c = FakeSMTP.instances[0]
    assert (c.host, c.port) == ("smtp.zoho.in", 465)
    assert c.context is not None
    assert c.calls[0] == ("login", "no-reply@x.com", "app-pw")
    assert c.calls[1][0] == "send"


def test_zoho_starttls_upgrades_before_login():
    p = SmtpEmailProvider("smtp.zoho.com", 587, "n@x.com", "n@x.com", "pw", "starttls")
    p.send("a@b.com", "Hi", "body")
    assert [c[0] for c in FakeSMTP.instances[0].calls] == ["starttls", "login", "send"]


def test_plain_relay_sends_without_login():
    SmtpEmailProvider("mailpit", 1025, "n@x.com").send("a@b.com", "Hi", "body")
    assert [c[0] for c in FakeSMTP.instances[0].calls] == ["send"]


def test_login_over_plaintext_is_refused():
    with pytest.raises(ValueError):
        SmtpEmailProvider("h", 25, "n@x.com", "u", "p", "none")


def test_settings_require_username_and_password_together():
    with pytest.raises(ValueError):
        Settings(secret_key=SECRET, smtp_username="u", smtp_security="ssl")
    with pytest.raises(ValueError):
        Settings(secret_key=SECRET, smtp_username="u", smtp_password="p")  # security left "none"


def test_from_settings_passes_zoho_values():
    s = Settings(
        secret_key=SECRET,
        smtp_host="smtp.zoho.in",
        smtp_port=465,
        smtp_security="ssl",
        smtp_username="u@x.com",
        smtp_password="pw",
    )
    p = SmtpEmailProvider.from_settings(s)
    assert (p.host, p.port, p.username, p.password, p.security) == (
        "smtp.zoho.in", 465, "u@x.com", "pw", "ssl",
    )
