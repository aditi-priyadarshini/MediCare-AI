# Reminder calls (WebRTC)

When a dose is due, the patient's phone rings like an incoming call. When they answer, the app
and the server open a WebRTC audio session and the server speaks the reminder. The patient then
taps **I took it**, **Not now** or **Skip this dose**.

Off by default (`CALLS_ENABLED=false`). Nothing rings unless the patient switched on
**Settings → Privacy and consent → "Ring my phone when a dose is due"** (`reminder_call`).

## Why it needs more than WebRTC

WebRTC moves audio between two peers. It cannot find a phone, wake a closed app or ring it.
Four things are needed besides the media:

| Piece | Here | Why |
|---|---|---|
| Wake-up | FCM (Android) and APNs VoIP / PushKit (iOS), from the worker | A closed app only starts for a push. |
| Ringing UI | notifee full-screen notification (Android), CallKit (iOS) | The OS decides what counts as a call. |
| Signalling | `WS /api/v1/calls/{id}/ws` | Carries the SDP offer and answer. |
| NAT traversal | STUN + **coturn** (TURN) | Mobile networks block direct paths; without TURN many calls have no audio. |

The server side of the call is an **aiortc** peer that plays text-to-speech audio. The phone
only receives audio, so no microphone permission is requested.

## Flow

```
worker tick ──> due dose + consent + device? ──> INSERT reminder_calls (ringing) ──> push {call_id}
                                                                                       │
phone rings <──────────────────────────────────────────────────────────────────────────┘
   │ patient answers
   ├─ POST /calls/{id}/accept ─> medicine name, ICE servers, one-shot ticket
   ├─ WS  /calls/{id}/ws?ticket=…  offer ──> answer      (aiortc peer speaks the reminder)
   └─ I took it ─> POST /doses/{id}/take   (the existing endpoint; the call never does this)
```

If the server has no voice (`TTS_COMMAND` unset) or media does not connect within about 12
seconds, the app reads the same text with the phone's own voice, so the reminder is still heard.

## Rules this feature keeps

- **A call never marks a dose.** The worker and the signalling code have no path that sets
  `taken`. Only the patient's tap, through `POST /doses/{id}/take`, does (existing audit trail
  and CSRF). `tests/test_calls.py::test_a_call_never_changes_the_dose_whatever_happens` pins this.
- **The push names no medicine.** It carries `{type, call_id}` only; the lock screen says
  "Reminder call". The medicine is returned by `accept`, to the signed-in patient, after answering.
- **Consent first, revocable.** Latest `reminder_call` row in the consent ledger decides.
- **No double rings.** `(patient, dedupe_key)` is unique and the insert is `ON CONFLICT DO NOTHING`.
  The row is committed *before* the push so a crash can't ring for an unknown call.
- **Bounded persistence.** At most `CALL_MAX_ATTEMPTS` (2) rings per dose, `CALL_RETRY_AFTER_SECONDS`
  apart, only after a missed or undeliverable ring, never after a decline, and never for a dose
  older than `CALL_MAX_AGE_MINUTES`.
- **One phone rings,** the most recently seen device. A phone that moves between accounts
  (log out / log in) follows the signed-in account. Dead push tokens are revoked automatically.
- **Signalling tickets** are signed, bound to one call and user, expire after
  `CALL_TICKET_TTL_SECONDS`, and are only honoured while the call is `answered`. A call can be
  answered once.
- **TURN credentials are short-lived** (coturn REST scheme, HMAC of `TURN_SECRET`) and never stored.

## Server setup

1. **Migrate:** `alembic upgrade head` (adds `devices`, `reminder_calls`).
2. **coturn.** `docker compose --profile calls up turn`, or install coturn yourself with
   `use-auth-secret` and the same secret. Open UDP 3478 and the relay range. Put it on a public IP
   with TLS (`turns:`) for networks that block UDP.
3. **Settings** (`backend/.env.example` lists them all): `CALLS_ENABLED=true`, `TURN_URLS`,
   `TURN_SECRET`. In production both TURN values are required and the app refuses to start without them.
4. **Android push:** create a Firebase project, add the Android app, download a service-account
   JSON (Firebase → Project settings → Service accounts) into `./secrets/`, set `FCM_PROJECT_ID`
   and `FCM_SERVICE_ACCOUNT_FILE`.
5. **iOS push:** in Apple Developer create a key (.p8) with APNs, put it in `./secrets/`, set
   `APNS_KEY_FILE`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`. The topic used is
   `<bundle id>.voip`. Use `APNS_SANDBOX=true` for debug builds.
6. **Voice (optional but recommended):** install a local TTS such as
   [Piper](https://github.com/rhasspy/piper) in the backend image and set
   `TTS_COMMAND="piper --model /models/<voice>.onnx --output_file {out}"`. The text is passed on
   stdin and no shell is used. Without it the phone speaks the reminder itself.
7. The worker needs the push credentials; the API container needs the TTS command. They are the
   same image and env block in `docker-compose.yml`.

## Phone app

See `mobile/ANDROID_SETUP_AND_TEST.md` (Android only; it needs a native build, not Expo Go).

## Testing without waiting for a dose

With `ENVIRONMENT=development` and `CALLS_ENABLED=true` the server also offers
`POST /calls/dev/test` (404 anywhere else). `python -m app.scripts.call_smoke` uses it to act as a
phone and check signalling, voice and audio; the app's Settings screen uses it for the test buttons.

## Known limitations (read before relying on this)

- **Not tested end to end.** The backend logic and the state machine have tests
  (`tests/test_calls.py`, PostgreSQL like the rest of the suite). The FCM and APNs adapters, aiortc
  media, TURN, notifee and CallKit were written against their documentation but **never run
  against real Google/Apple services or a real phone from this repository.** Expect to debug
  device-level issues (CallKit audio-session activation on iOS, OEM battery killers on Android).
- **Store policy.** Android full-screen intents are restricted by Google Play to calling and
  alarm apps; iOS requires VoIP push to be used for real calls. A medicine-reminder app that
  rings a robot may be rejected or require a justification. Check current policy before publishing.
  Side-loaded or enterprise/internal distribution has no such problem.
- **Android reliability.** Some phones (Xiaomi, Oppo, Vivo, Samsung power saving) delay or drop
  high-priority pushes for apps the user hasn't exempted from battery optimisation. The in-app
  notification and reminder email still exist as backups; the call is an extra, not the only channel.
- **Language.** The spoken text is English. Hindi and Odia voices depend on the TTS model you
  install (Odia support in open TTS is limited) and on the phone's voices for the fallback.
- **Doses only.** Refill and expiry alerts do not ring.
- **Do Not Disturb** and silent mode are decided by the phone. Nothing here overrides them.
- **No two-way audio.** The patient cannot speak to the server; a future "talk to a nurse or
  caregiver" call would reuse this signalling but needs a microphone permission, a human-side
  client and its own consent text.
- **Scale.** Signalling and the aiortc peer run inside the API process, one peer per answered
  call, for at most `CALL_SESSION_MAX_SECONDS`. That is fine for a pilot; for many concurrent
  calls move the peer into its own service.
- Rate limiting is still in process memory like the rest of the API.
- Only the most recent device rings; there is no "ring all my devices".
