# MediCare AI

Patient-centred healthcare coordination platform (academic build). Specification lives in [`docs/`](docs/README.md).
Synthetic data only. Not a medical device and not for real patient records.

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Foundation: Next.js + FastAPI + PostgreSQL/Alembic, Docker Compose, CI, health checks, structured logs | Done |
| 1 | Auth (email/password, email verification, password reset, Google OAuth), patient profile, conditions, allergies, emergency contacts, consents, accessibility preferences, admin role | Done |
| 2 | Records & labs: health records with PDF/PNG/JPEG upload and download, lab results with report-range flags and per-test trends | Done |
| 3 | Medications: catalogue baseline, prescriptions vs self-reported medicines, schedules, dose logs, supplies (lot/expiry), refill and expiry alerts, reminder worker | Done (see notes) |
| 4 | Medicine safety: ingredient catalogue, curated sourced rules, drug/food/condition/allergy checks, candidate alternatives with dated prices, side-effect notes, authenticity adapter (unsupported by default) | Done (see notes) |
| 5 | AI assistant: consent-gated retrieval of the patient's own records, cited evidence, safety policy, answer validation, chat sessions | Done (see notes) |
| 6 | Voice and accessibility: speech adapters, English/Hindi/Odia UI strings, quick display toggles, voice command guardrails | Done (see notes) |
| 7 | Discovery: sourced pharmacy and doctor directories, reported-stock contract, credential status, appointment requests, educational diet planner | Done (see notes) |
| 8+ | Sharing and emergency workflows | Not started |

Phase 2 notes:
- Uploads are identified by magic bytes (the client's Content-Type and filename are never trusted), capped at `MAX_UPLOAD_BYTES` (10 MB), stored under random keys in `STORAGE_DIR`, and only ever served back to their owner as attachments. Docker Compose mounts a named volume for them.
- A lab flag (`low` / `normal` / `high` / `unknown`) is computed by the server from the value and the range printed on the report. It is not an interpretation: the UI says "below/above report range" and never "abnormal".
- Records and results are never hard-deleted by the user; "remove" sets `entered_in_error`. Editing content resets `verification_status` to `patient_reported`. File downloads are written to the audit log.
- Endpoints: `/records` (+ `/{id}/file`), `/labs`, `/labs/tests`, `/labs/trend?test_name=`.

Phase 3 notes:
- A medicine is either `prescribed` (linked to a prescription a clinician wrote) or `self_reported` (a medication statement, including over-the-counter use). The server derives this from whether a prescription is linked; the client cannot set it.
- Schedules are wall-clock times in an IANA time zone (copied from the profile at creation). Doses are materialised as `pending` rows 48 hours ahead; a unique (schedule, slot) constraint makes generation idempotent. DST rules are fixed and tested: a time that falls in a spring-forward gap still happens (at the first valid minute after it), and a time that repeats in a fall-back hour happens once.
- **A dose is only ever `taken` through an explicit patient action** (`POST /doses/{id}/take`). The worker and the API never mark one taken; "overdue" is derived at read time. Taking a dose uses stock from the pack that expires first; undoing returns it.
- Alerts (refill, out of stock, expiring, expired) are computed live from supplies and schedules, and the worker turns the same alerts into notifications. Refill reminders repeat at most weekly; expiry reminders are sent once per pack.
- Reminder email is opt-in (`reminder_email` consent), at most one per patient per tick, and never contains a medicine name.
- The catalogue holds names, forms and strengths only: no dosing, interactions or advice. Its 14 seed rows are in migration 0003; admins add more with `POST /admin/medicines`.
- Run the worker with `python -m app.scripts.run_worker` (or `--once`). Docker Compose starts it as the `worker` service.
- Endpoints: `/medicines`, `/prescriptions`, `/medications` (+ `/schedules`, `/supplies`, `/alerts`), `/schedules/{id}`, `/supplies/{id}`, `/doses` (+ `/take`, `/skip`, `/reset`), `/notifications`.

Phase 4 notes:
- **The bundled safety data is a synthetic demonstration set** (migration 0004: 14 ingredients, 5 rules, source "MediCare AI demonstration dataset", not clinically reviewed). It exists to exercise the checks. Replace it through `/admin` before any real use.
- Checks return only `findings`, `no_matching_record` or `insufficient_data`. There is no "safe" outcome; the UI never says safe, clear or success. A medicine that cannot be mapped to ingredients, or a patient with no recorded conditions/allergies, gives `insufficient_data`.
- A patient medicine maps to ingredients through its catalogue link or an exact, unambiguous name match. Conditions match rule terms on whole words (plurals tolerated) or on code; only `active` conditions are used.
- Every finding carries source, version, jurisdiction and review date. Two rules for one pair that disagree on severity are both shown and flagged `conflict`.
- Rules are never edited: an admin retires one (`POST /admin/safety-rules/{id}/retire`) and creates a new one. Drug-drug pairs are stored once in canonical order.
- Alternatives are `candidate`s only when ingredients, strengths (same unit, no conversion), form, route and release type all match. Missing data on the chosen medicine gives `insufficient_data`; it is never guessed.
- Prices need source, pack size and unit, jurisdiction and an observation time; unit price is computed server-side, and prices older than 90 days are flagged `stale`. Admin-entered only.
- Authenticity: no authoritative source is integrated. The default adapter answers `unable_to_verify`, and the router downgrades any `verified` that does not name its source.
- Side-effect notes are private, record what the patient noticed, assert no causation and are sent nowhere. Removal is soft (`entered_in_error`).
- Audit entries for checks hold counts and outcomes only, never medicine names.
- Not built: `/safety/medicines/{id}/adverse-effects` (no sourced dataset), second-person review of rules, regulator submission of side-effect notes.
- Endpoints: `/safety/{drug-drug,drug-food,drug-condition,allergy}/check`, `/safety/medicines/{id}/warnings`, `/safety/authenticity/check`, `/medicines/{id}/alternatives`, `/adverse-events`, and admin `/admin/{sources,ingredients,safety-rules}`, `/admin/medicines/{id}/{composition,prices}`.

Phase 5 notes:
- **Retrieval, not memory.** For each question the server runs fixed, owner-scoped queries for only the record kinds the chat has switched on (medicines, history, labs, doses, allergies) and only while the patient's `ai_context` consent is granted. All switches are off by default. Revoking consent stops use immediately, even if switches remain on. The model never sees the database, SQL or credentials, and uploaded file contents are never read.
- **Fixed responses bypass the model.** Urgent symptoms get emergency guidance; requests to start/stop/change a medicine or dose, and diagnosis requests, are declined with a pointer to a clinician. No records are read for these.
- **No evidence, no answer.** If nothing relevant is found the assistant says so; it does not answer from general knowledge. Medicine reference notes come from the Phase 4 curated rules with source, version and review date.
- **Cited evidence.** Every patient fact is an evidence item (`E1`, `E2`, ...) with record id, date, verification status and source. Changes between lab results are calculated by the server only for the same test in the same unit; otherwise results are listed as "not comparable". Same-day conflicts are shown, not merged. Medicine timelines are positional ("before / while recorded active / after"), never causal.
- **Model drafts are untrusted.** Evidence is sent HTML-escaped inside delimited blocks, with identifiers (name, email, phone) never included and instruction-like free text withheld. The draft is rejected, and the plain records listed instead, if it cites unknown evidence, contains a number not in the evidence, or gives treatment/causal claims. The disclaimer and the association-not-causation note are added by the server.
- **No model configured is a supported mode.** With `LLM_PROVIDER=none` (default) the assistant lists the matching records itself ("evidence only"). Set `LLM_PROVIDER=anthropic`, `LLM_API_KEY` and optionally `LLM_MODEL` to enable drafting. Review the provider's retention and training settings before use.
- Each question is answered independently (no earlier answers are fed back). Chats can be deleted (hard delete); `chat_context_access_logs` keeps ids and counts only.
- Not built: streaming, other languages for server text (the `language` field only asks the model to reply in en/hi/or; Phase 6), retrieval over uploaded-file text/OCR.
- Endpoints: `/assistant/status`, `/assistant/sessions` (+ `/{id}`, `/{id}/context`, `/{id}/messages`), `/assistant/messages/{id}/evidence`.

Phase 6 notes:
- **Voice is optional and off by default.** The `voice_enabled` accessibility preference (My Health > Accessibility) turns on the microphone buttons and read-aloud buttons. Every screen works without them.
- **Speech lives behind adapters** (`frontend/lib/speech.ts`): one-shot recognition and queued text-to-speech via the browser's Web Speech API. A server-side provider could replace them without touching components. Locales are `en-IN`, `hi-IN`, `or-IN`.
- **Privacy:** browser speech recognition is normally done by the browser vendor's cloud service, so the UI says so next to the microphone. MediCare AI receives nothing until the patient presses Send.
- **Dictation never submits.** A transcript is put in the question box as editable text. The patient reads it and presses Send.
- **Voice commands can only open a page.** `frontend/lib/voice-commands.ts` classifies a transcript as navigate, blocked, emergency or unknown, and has no access to the API. Logging a dose, adding, removing, stopping or changing anything is answered with "use the buttons on the Medicines page". Emergency words show a visible Call 112 link and do nothing else. Two pages named at once, or anything unclear, does nothing. Navigation still needs a tap on Open (Escape or Cancel dismisses it).
- **Read aloud never performs an action.** Assistant answers can be read aloud with citation markers removed. The doses card reads today's pending doses plus a reminder to check name, strength and time on screen. Text is read only in a voice for its own language (judged by script): with no Hindi or Odia voice installed it says so instead of mispronouncing medical text in another voice.
- **Languages:** UI strings are in `frontend/lib/i18n/{en,hi,or}.ts` and fall back to English per string. **The Hindi and Odia strings are machine-generated and have not been reviewed by a native speaker**, and the UI says so on every translated screen. Only the app shell, navigation, accessibility settings, voice features, the assistant's input and safety text, and the dose reading are translated; other pages remain in English. The document root stays `lang="en"` and translated strings carry their own `lang`, so screen readers choose the right voice. The assistant now creates chats in the patient's preferred language.
- **Display:** header toggles for larger text and high contrast save to the profile. `--teal-700` was darkened from `#167C78` to `#157873` because teal text on the mint tint was 4.49:1; contrast of the main text/background pairs, in normal and high-contrast mode, is at least 4.5:1. The mobile navigation was fixed to seven columns (it had six for seven items).
- **Not done:** native-speaker review of Hindi and Odia, voice confirmation by speaking "yes" (confirmation is a tap), server-side speech providers, translation of the remaining pages and of server-generated text, a manual screen-reader pass with NVDA/VoiceOver/TalkBack and a real-device check of Hindi/Odia voices (only automated tests were run).
- No backend change was needed; `voice_enabled` already existed.

Phase 7 notes:
- **Nothing is invented.** Every pharmacy and doctor row names its source (`provider_sources`: publisher, URL, licence, date retrieved) and when that source observed it. Each source has its own `stale_after_hours`; older data is labelled "May be out of date", never hidden. Hours are shown as free text exactly as the source gave them and are never turned into "open now".
- **Stock is only ever "reported by a source at a time".** `pharmacy_inventory_snapshots` are append-only reports with the source's own timestamp, and the newest per pharmacy and medicine is shown. No feed means "No stock information. Call to confirm", never "out of stock". The `PharmacyInventoryProvider` contract exists (`discovery/providers.py`) but no feed is integrated; stock enters through the validated admin endpoint `POST /admin/pharmacies/{id}/inventory`, the same path an adapter would use.
- **Doctor credentials are labelled by how they were checked:** `unverified`, `source_listed` (the directory lists it) or `verified`. The database refuses `verified` without a credential source and a verification time. Registration numbers are stored but only shown masked and never audited. Doctors are listed by name or distance, never ranked; there are no reviews or ratings.
- **Appointment requests do not pretend to be bookings.** A clinic in `request_only` mode (the default) gets a request saved in the app only, and the status text says it was NOT sent. `confirmed` and `declined` exist only with a provider reference and response time (database check), and the only way to set them is the provider-response endpoint, which needs a matching reference. `AppointmentProvider` has no real integration: a `provider`-mode clinic answers "call the clinic" and stores nothing. What an adapter would receive is deliberately minimal (no name, contact or reason).
- **Location is per search.** Latitude/longitude are query parameters, used for that request and not stored, logged or audited. Distance sort uses a bounding-box pre-filter plus exact great-circle distance; places without coordinates are left out of distance searches.
- **Map: link-out only (deviation).** Results have a "Show on OpenStreetMap" link that opens openstreetmap.org in a new tab. No tiles are embedded, because OSM's public tile servers are not meant for application traffic and embedding would send the viewed area to a third party. A tiled map needs a tile provider chosen and paid for; the list is the primary view.
- **Diet planner is deterministic, not a model.** `nutrition/planner.py` builds 7 days from a small curated collection (`catalogue.py`, 52 ideas, versioned). Dietary tags are derived from ingredient words, so filters cannot disagree with what is displayed. Recorded allergies are always applied and recorded conditions are always screened, without the patient opting in. Foods or allergies the catalogue cannot match are flagged, not ignored, and constraints are never relaxed to fill a slot (empty slots stay empty). Kidney disease, a history of an eating disorder, or a child under 12 mean no plan is made (409 `DIETITIAN_REVIEW_REQUIRED`); pregnancy, a clinician-set diet, several conditions, or recorded medicines add review flags. No calories, portions or health claims.
- **Demo data:** migration 0006 seeds four pharmacies and four doctors, all labelled "(demo)", with invented addresses and coordinates, no phone numbers and no verified credentials. Replace them via the admin endpoints.
- **Mobile navigation** now scrolls horizontally (nine items) instead of a fixed grid. Hindi and Odia names for the two new nav items are machine-generated; the Find care and Diet pages themselves are English only.
- **Not built:** a real stock feed, clinic booking integration, doctor-side or admin UI for curating the directory (API only), notifying a patient when a clinic replies, reviews, languages beyond English on the new pages, a manual screen-reader pass of the new pages.

Deferred from Phase 1: optional phone OTP, caregiver delegation. Onboarding still omits a "current medicines" step; medicines are added from the Medicines page.

## Run it

```bash
cp .env.example .env            # set POSTGRES_PASSWORD and SECRET_KEY
docker compose up --build       # web :3000, API :8000, mail catcher :8025
```

Verification and reset emails appear in Mailpit at http://localhost:8025.

Create an admin: `docker compose run --rm -e ADMIN_PASSWORD=... backend python -m app.scripts.create_admin --email you@example.com`

### Without Docker

```bash
# backend (needs PostgreSQL 16 with the citext extension)
cd backend && pip install -r requirements-dev.txt
cp .env.example .env && alembic upgrade head
uvicorn app.main:app_factory --factory --reload

# frontend
cd frontend && npm install && npm run dev
```

## Test

```bash
cd backend && ruff check . && pytest          # TEST_DATABASE_URL defaults to localhost medicare_test
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

## Layout

`backend/app/{core,identity,patients,records,audit,admin,api}` modular monolith (see `docs/ARCHITECTURE.md`);
`frontend/{app,components,lib}`; decisions in `docs/ARCHITECTURE.md` (ADR-006..008).

## Deployment (GitHub Actions to OCI)

Pushing to `main` runs `.github/workflows/deploy.yml`: CI (`ci.yml`) must pass, then the backend and frontend images are built and pushed to GHCR as `ghcr.io/<owner>/medicare-ai-{backend,frontend}` (tags `latest` and the commit SHA), then the server is updated over SSH and the deploy waits for both services to report healthy. A failed health check fails the workflow and prints the service logs.

Repository secrets: `OCI_HOST`, `OCI_USER`, `OCI_SSH_KEY` (private deploy key), `GHCR_PULL_TOKEN` (a token with `read:packages`). Optional repository variable `OCI_APP_DIR` (default `/home/ubuntu/medicare-ai`).

One-time server setup: install Docker with the compose plugin, let `OCI_USER` use `sudo docker`, and create `OCI_APP_DIR/.env` with `POSTGRES_PASSWORD`, `SECRET_KEY`, `FRONTEND_ORIGINS` (your public https origin), `SMTP_HOST` (and optionally `SMTP_PORT`, `SMTP_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and for the assistant `LLM_PROVIDER=anthropic`, `LLM_API_KEY`, `LLM_MODEL`; without them the assistant runs in evidence-only mode). The frontend listens on `127.0.0.1:3000`; put a TLS reverse proxy in front of it. Production refuses to start without `COOKIE_SECURE`, a real `SECRET_KEY` and a non-memory email backend. The app's SMTP client has no login support, so `SMTP_HOST` must be a relay that accepts mail from the server (for example a local Postfix relay).

To roll back, re-run the workflow on an earlier commit, or on the server run `IMAGE_PREFIX=ghcr.io/<owner> IMAGE_TAG=<old-sha> docker compose -f docker-compose.prod.yml up -d`.
