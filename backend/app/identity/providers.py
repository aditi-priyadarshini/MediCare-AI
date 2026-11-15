"""Replaceable adapters for email delivery and Google OAuth (see ARCHITECTURE.md §9)."""

import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol
from urllib.parse import urlencode

import httpx

log = logging.getLogger("app.providers")


# --------------------------------------------------------------------------- email
class EmailProvider(Protocol):
    def send(self, to: str, subject: str, body: str) -> None: ...


class SmtpEmailProvider:
    def __init__(self, host: str, port: int, sender: str):
        self.host, self.port, self.sender = host, port, sender

    def send(self, to: str, subject: str, body: str) -> None:
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = self.sender, to, subject
        msg.set_content(body)
        with smtplib.SMTP(self.host, self.port, timeout=10) as smtp:
            smtp.send_message(msg)


@dataclass
class SentEmail:
    to: str
    subject: str
    body: str


class MemoryEmailProvider:
    """Test/dev double. Never used in production (blocked by settings validation)."""

    def __init__(self) -> None:
        self.outbox: list[SentEmail] = []

    def send(self, to: str, subject: str, body: str) -> None:
        self.outbox.append(SentEmail(to, subject, body))


# ------------------------------------------------------------------- google oauth
class OAuthError(Exception):
    pass


@dataclass
class GoogleIdentity:
    subject: str
    email: str
    email_verified: bool
    name: str | None


class GoogleOAuthProvider(Protocol):
    def authorization_url(self, state: str, code_challenge: str) -> str: ...
    def exchange(self, code: str, code_verifier: str) -> GoogleIdentity: ...


class HttpGoogleOAuthProvider:
    AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105
    USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

    def __init__(self, client_id: str, client_secret: str, redirect_uri: str):
        self.client_id, self.client_secret, self.redirect_uri = (
            client_id,
            client_secret,
            redirect_uri,
        )

    def authorization_url(self, state: str, code_challenge: str) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
        return f"{self.AUTH_URL}?{urlencode(params)}"

    def exchange(self, code: str, code_verifier: str) -> GoogleIdentity:
        try:
            with httpx.Client(timeout=10) as client:
                tok = client.post(
                    self.TOKEN_URL,
                    data={
                        "code": code,
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "redirect_uri": self.redirect_uri,
                        "grant_type": "authorization_code",
                        "code_verifier": code_verifier,
                    },
                )
                tok.raise_for_status()
                access = tok.json()["access_token"]
                info = client.get(self.USERINFO_URL, headers={"Authorization": f"Bearer {access}"})
                info.raise_for_status()
                data = info.json()
            return GoogleIdentity(
                subject=str(data["sub"]),
                email=str(data["email"]),
                email_verified=bool(data.get("email_verified")),
                name=data.get("name"),
            )
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            log.warning("google_exchange_failed", extra={"event": type(exc).__name__})
            raise OAuthError from exc
