"""Replaceable adapters that wake the phone app so it can ring (see docs/REMINDER_CALLS.md).

The payload is data-only and carries no medicine name, dose or patient detail: it only says "a
call is ringing" and which call. The app fetches the details from the API after the patient
answers, over their signed-in session.

* Android: FCM HTTP v1, high priority data message. The app shows a full-screen incoming-call
  notification.
* iOS: APNs VoIP push (PushKit). iOS requires the app to report a CallKit call for every VoIP
  push, so the app does that straight away.

None of these adapters has been exercised against the live Google or Apple services from this
repository; they are small and isolated so you can test them with your own credentials first.
"""

import logging
import time
from dataclasses import dataclass
from typing import Protocol

import httpx

log = logging.getLogger("app.calls.push")


class PushError(Exception):
    """`permanent` means the token is dead (uninstalled app, revoked token): stop using it."""

    def __init__(self, reason: str, permanent: bool = False):
        super().__init__(reason)
        self.reason = reason
        self.permanent = permanent


@dataclass(frozen=True)
class Target:
    platform: str  # "android" | "ios"
    push_token: str
    voip_token: str | None


class PushProvider(Protocol):
    def send_call(self, target: Target, call_id: str, ttl_seconds: int) -> None: ...


class UnsupportedPushProvider:
    """Default when nothing is configured: ringing is reported as unavailable, never faked."""

    def send_call(self, target: Target, call_id: str, ttl_seconds: int) -> None:
        raise PushError("push_unavailable")


@dataclass
class SentPush:
    target: Target
    call_id: str
    ttl_seconds: int


class MemoryPushProvider:
    """Test/dev double that records what would have been sent."""

    def __init__(self) -> None:
        self.sent: list[SentPush] = []
        self.fail_with: PushError | None = None

    def send_call(self, target: Target, call_id: str, ttl_seconds: int) -> None:
        if self.fail_with is not None:
            raise self.fail_with
        self.sent.append(SentPush(target, call_id, ttl_seconds))


class FcmPushProvider:
    SCOPE = "https://www.googleapis.com/auth/firebase.messaging"

    def __init__(self, project_id: str, service_account_file: str):
        from google.oauth2 import service_account  # imported lazily: optional at runtime

        self.project_id = project_id
        self._creds = service_account.Credentials.from_service_account_file(
            service_account_file, scopes=[self.SCOPE]
        )

    def _token(self) -> str:
        from google.auth.transport.requests import Request

        if not self._creds.valid:
            self._creds.refresh(Request())
        return self._creds.token

    def send_call(self, target: Target, call_id: str, ttl_seconds: int) -> None:
        body = {
            "message": {
                "token": target.push_token,
                # Data-only, so the app's background handler runs and decides what to show.
                "data": {"type": "reminder_call", "call_id": call_id},
                "android": {"priority": "HIGH", "ttl": f"{ttl_seconds}s"},
            }
        }
        try:
            resp = httpx.post(
                f"https://fcm.googleapis.com/v1/projects/{self.project_id}/messages:send",
                json=body,
                headers={"Authorization": f"Bearer {self._token()}"},
                timeout=10,
            )
        except (httpx.HTTPError, OSError) as exc:
            raise PushError(type(exc).__name__) from exc
        if resp.status_code == 200:
            return
        status = ""
        try:
            status = resp.json().get("error", {}).get("status", "")
        except ValueError:
            pass
        # UNREGISTERED / INVALID_ARGUMENT on the token mean the app is gone.
        raise PushError(
            status or f"http_{resp.status_code}",
            permanent=status in {"UNREGISTERED", "INVALID_ARGUMENT", "NOT_FOUND"},
        )


class ApnsVoipPushProvider:
    def __init__(self, key_file: str, key_id: str, team_id: str, bundle_id: str, sandbox: bool):
        with open(key_file, encoding="utf-8") as fh:
            self._key = fh.read()
        self.key_id, self.team_id, self.bundle_id = key_id, team_id, bundle_id
        self.host = "api.sandbox.push.apple.com" if sandbox else "api.push.apple.com"
        self._jwt: tuple[str, float] | None = None
        self._client = httpx.Client(http2=True, timeout=10)

    def _bearer(self) -> str:
        import jwt  # PyJWT, lazily imported

        now = time.time()
        if self._jwt is None or now - self._jwt[1] > 40 * 60:  # Apple wants 20-60 minutes
            token = jwt.encode(
                {"iss": self.team_id, "iat": int(now)},
                self._key,
                algorithm="ES256",
                headers={"kid": self.key_id},
            )
            self._jwt = (token, now)
        return self._jwt[0]

    def send_call(self, target: Target, call_id: str, ttl_seconds: int) -> None:
        if not target.voip_token:
            raise PushError("no_voip_token", permanent=False)
        headers = {
            "authorization": f"bearer {self._bearer()}",
            "apns-topic": f"{self.bundle_id}.voip",
            "apns-push-type": "voip",
            "apns-priority": "10",
            "apns-expiration": str(int(time.time()) + ttl_seconds),
        }
        try:
            resp = self._client.post(
                f"https://{self.host}/3/device/{target.voip_token}",
                json={"type": "reminder_call", "call_id": call_id},
                headers=headers,
            )
        except (httpx.HTTPError, OSError) as exc:
            raise PushError(type(exc).__name__) from exc
        if resp.status_code == 200:
            return
        reason = ""
        try:
            reason = resp.json().get("reason", "")
        except ValueError:
            pass
        raise PushError(
            reason or f"http_{resp.status_code}",
            permanent=resp.status_code == 410 or reason in {"BadDeviceToken", "Unregistered"},
        )


class RoutingPushProvider:
    """Sends to whichever platform the device is on; a platform with no adapter is unavailable."""

    def __init__(self, android: PushProvider | None, ios: PushProvider | None):
        self._by_platform = {"android": android, "ios": ios}

    def send_call(self, target: Target, call_id: str, ttl_seconds: int) -> None:
        adapter = self._by_platform.get(target.platform)
        if adapter is None:
            raise PushError("push_unavailable")
        adapter.send_call(target, call_id, ttl_seconds)


def build_push_provider(settings) -> PushProvider:
    """Real adapters only when fully configured; otherwise calls report 'unavailable'."""
    if not settings.calls_enabled:
        return UnsupportedPushProvider()
    android = None
    if settings.fcm_project_id and settings.fcm_service_account_file:
        android = FcmPushProvider(settings.fcm_project_id, settings.fcm_service_account_file)
    ios = None
    if all(
        (
            settings.apns_key_file,
            settings.apns_key_id,
            settings.apns_team_id,
            settings.apns_bundle_id,
        )
    ):
        ios = ApnsVoipPushProvider(
            settings.apns_key_file,
            settings.apns_key_id,
            settings.apns_team_id,
            settings.apns_bundle_id,
            settings.apns_sandbox,
        )
    return RoutingPushProvider(android, ios)
