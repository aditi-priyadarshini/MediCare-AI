# API Specification

Base path: `/api/v1`  
Format: JSON over HTTPS  
Authentication: secure session cookie recommended for browser; CSRF protection for state-changing cookie-authenticated requests.

## 1. API conventions

- Use plural resource names.
- Use UUID identifiers.
- Return consistent error format.
- Paginate collections.
- Validate all inputs server-side.
- Enforce ownership and role checks in service layer.
- Use idempotency keys for reminder creation, booking requests and other retryable operations.
- Do not expose internal storage keys or secrets.

Example error:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found.",
    "request_id": "..."
  }
}
```

## 2. Authentication

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Sign in |
| POST | `/auth/logout` | Revoke session |
| GET | `/auth/me` | Current identity |
| POST | `/auth/email/verify` | Verify email code |
| POST | `/auth/email/resend` | Resend verification |
| POST | `/auth/otp/request` | Request OTP |
| POST | `/auth/otp/verify` | Verify OTP |
| POST | `/auth/password/forgot` | Request password reset |
| POST | `/auth/password/reset` | Reset password |
| GET | `/auth/google/start` | Begin OAuth |
| GET | `/auth/google/callback` | OAuth callback |

## 3. Patient profile and health

| Method | Path | Purpose |
|---|---|---|
| GET/PUT | `/profile` | Read/update profile |
| GET/POST | `/conditions` | List/create condition |
| PATCH | `/conditions/{id}` | Update condition |
| GET/POST | `/allergies` | List/create allergy |
| PATCH | `/allergies/{id}` | Update allergy |
| GET/POST | `/vitals` | List/create vitals |
| GET/POST | `/medical-events` | List/create event |

## 4. Documents and lab results

| Method | Path | Purpose |
|---|---|---|
| POST | `/documents` | Upload document |
| GET | `/documents` | List documents |
| GET | `/documents/{id}` | Metadata |
| POST | `/documents/{id}/extract` | Start OCR |
| GET | `/documents/{id}/extraction` | Get extraction |
| POST | `/documents/{id}/confirm` | Confirm extracted fields |
| GET/POST | `/lab-reports` | List/create report |
| GET/POST | `/lab-observations` | List/create observation |
| GET | `/lab-observations/trends` | Comparable trend query |

## 5. Medication

| Method | Path | Purpose |
|---|---|---|
| GET | `/medicines` | Search catalogue |
| GET | `/medicines/{id}` | Medicine detail |
| GET/POST | `/medication-statements` | List/add patient medication |
| GET/POST | `/medication-requests` | List/add prescription/order |
| PATCH | `/medication-statements/{id}` | Update status/details |
| GET/POST | `/medication-schedules` | List/create schedule |
| PATCH | `/medication-schedules/{id}` | Update schedule |
| GET/POST | `/dose-logs` | List/record dose |
| GET/POST | `/medicine-batches` | List/add batch |
| GET | `/medicine-batches/expiring` | Expiring stock |
| GET/POST | `/refill-events` | Refill tracking |

## 6. Safety

| Method | Path | Purpose |
|---|---|---|
| POST | `/safety/drug-drug/check` | Ingredient interaction check |
| POST | `/safety/drug-food/check` | Food interaction check |
| POST | `/safety/drug-condition/check` | Condition warning check |
| POST | `/safety/allergy/check` | Allergy warning check |
| GET | `/safety/medicines/{id}/warnings` | Medicine warnings |
| GET | `/safety/medicines/{id}/adverse-effects` | Adverse effect reference (not built: no sourced dataset) |
| POST | `/safety/authenticity/check` | Authenticity check; `unable_to_verify` unless a source is connected |
| GET | `/medicines/{id}/alternatives` | Candidates with sourced, dated prices |
| DELETE | `/adverse-events/{id}` | Soft removal (`entered_in_error`) |
| POST | `/adverse-events` | Patient reaction report |
| GET | `/adverse-events` | Patient's reports |

## 7. AI assistant

| Method | Path | Purpose |
|---|---|---|
| POST | `/assistant/sessions` | Create chat |
| GET | `/assistant/sessions` | List chats |
| GET | `/assistant/sessions/{id}` | Get chat |
| POST | `/assistant/sessions/{id}/messages` | Ask question |
| GET | `/assistant/messages/{id}/evidence` | Inspect evidence |
| PATCH | `/assistant/sessions/{id}/context` | Update context consent |
| DELETE | `/assistant/sessions/{id}` | Delete chat (hard delete; 204) |
| GET | `/assistant/status` | Model mode (`llm` / `evidence_only`), consent state, notices |

Phase 5 behaviour:
- `POST /assistant/sessions` body `{title?, language: en|hi|or, context: {medicines,history,labs,doses,allergies}}`. All context switches default to `false`. Switching any ON without the `ai_context` consent returns 403 `AI_CONTEXT_CONSENT_REQUIRED`; switching OFF never needs consent. `PATCH .../context` merges the given switches.
- `POST .../messages` body `{content}` (1-2000 chars) returns `{user_message, assistant_message}`. The assistant message has `safety_classification` (`answered`, `evidence_only`, `fallback`, `no_data`, `urgent_escalation`, `declined_treatment`, `declined_diagnosis`), `mode` and `evidence[]` (`ref`, `source_type`, `source_record_id`, `source_label`, `recorded_at`, `verification_status`, `cited`). Limits: 20 questions/minute/user, 200 messages and 100 chats per user (409 `SESSION_FULL` / `SESSION_LIMIT`).
- Other users' chats and messages return 404.

## 8. Discovery and providers

| Method | Path | Purpose |
|---|---|---|
| GET | `/pharmacies/search` | Search pharmacies: `q`, `city`, `lat`+`lon`+`radius_km` (both or neither; used for this request only), `medicine_id` (adds a `stock` block per pharmacy), `limit`, `offset` |
| GET | `/pharmacies/{id}` | Pharmacy detail with source and freshness |
| GET | `/pharmacies/{id}/inventory` | Latest stock report per medicine; `feed_available: false` when no source has reported |
| GET | `/doctors/search` | Search doctors: `q`, `specialty`, `city`, `language`, `verified_only`, location as above |
| GET | `/doctors/specialties` | Specialties of active doctors |
| GET | `/doctors/{id}` | Doctor detail with credentials (registration masked) |
| POST | `/appointments` | Request an appointment (`request_only` clinics: saved here, not sent) |
| GET | `/appointments` | List my requests |
| GET | `/appointments/{id}` | One request |
| POST | `/appointments/{id}/cancel` | Cancel a request |

Search results carry a `notice`, a `source` and a `freshness` (`fresh` or `stale`, with a label). Stock is `no_feed` or `reported`, never an assumed state. Errors: `PROVIDER_UNAVAILABLE` (409, nothing stored), `ALREADY_REQUESTED`, `APPOINTMENT_LIMIT`, `NOT_CANCELLABLE`.

## 9. Diet, sharing and emergency

| Method | Path | Purpose |
|---|---|---|
| GET/PUT | `/diet/preferences` | Preferences; GET also returns the review flags that apply now |
| GET/POST | `/diet/plans` | List/create a 7-day educational plan from saved preferences |
| GET/DELETE | `/diet/plans/{id}` | Read or delete a plan |

Plan errors: `PREFERENCES_REQUIRED` (409), `DIETITIAN_REVIEW_REQUIRED` (409, no plan is made), `PLAN_LIMIT`. A plan stores the constraints it used, its flags and the catalogue version.
| POST | `/sharing/grants` | Create share grant |
| GET | `/sharing/grants` | List active grants |
| DELETE | `/sharing/grants/{id}` | Revoke grant |
| GET | `/shared/{token}` | Resolve authorized share |
| GET/POST | `/emergency/contacts` | Emergency contacts |
| POST | `/emergency/requests` | Create request |
| POST | `/ambulance/bookings` | Simulation/provider adapter |
| GET | `/ambulance/bookings/{id}` | Booking status |

## 10. Admin

- `/admin/users`
- `/admin/medicines`
- `/admin/ingredients`
- `/admin/reference-sources`
- `/admin/interactions`
- `/admin/provider-sources` (GET, POST): where directory, stock and credential data came from, with each source's freshness policy
- `/admin/pharmacies` (POST), `/admin/pharmacies/{id}/retire`, `/admin/pharmacies/{id}/inventory` (POST a stock report naming its source and observation time)
- `/admin/doctors` (POST), `/admin/doctors/{id}/retire`, `/admin/doctors/{id}/credentials` (POST; `verified` needs a credential source and time)
- `/admin/appointments/{id}/provider-response` (POST; stand-in for a clinic's reply, needs the matching provider reference)
- `/admin/feedback` (GET `?status=new|reviewed|actioned|dismissed|all`), `/admin/feedback/{id}/moderate` (POST `{status, note}`)
- `/admin/audit-logs` (GET; `action` prefix, `actor_user_id`, `since`, `until`; shows `admin.*`, `auth.*`, `feedback.*` only)
- `/admin/users` (GET), `/admin/users/{id}/deactivate|reactivate` (POST)
- `/admin/medicines` (GET `?q=`, POST), `/admin/overview` (GET counts)
- `/admin/safety-rules/{id}/supersede` (POST a full rule body: new version, old retired), `/history` (GET), `/review` (POST, second administrator), `/retire` (POST)
- Patient: `POST /feedback`, `GET /feedback` (own only)

Admin endpoints require explicit role and permission checks.

## 11. Example AI request

```json
{
  "message": "How have my HbA1c results changed since my medication was recorded?",
  "context": {
    "use_medications": true,
    "use_lab_results": true,
    "use_conditions": true,
    "use_allergies": false,
    "date_range": {
      "from": "2026-01-01",
      "to": "2026-11-14"
    }
  }
}
```

The server must independently validate patient ownership, consent and context scope. Never trust a patient ID supplied by the browser.

## 12. Example evidence-aware response

```json
{
  "answer": "Your recorded values decreased over the selected period. This is an observed trend, not proof that a particular medicine caused the change.",
  "evidence": [
    {
      "type": "lab_observation",
      "label": "HbA1c",
      "value": 7.4,
      "unit": "%",
      "observed_at": "2026-10-10",
      "verification_status": "patient_confirmed"
    }
  ],
  "limitations": [
    "The available records do not establish causation.",
    "Medication adherence data may be incomplete."
  ],
  "requires_professional_review": true
}
```

All example values are illustrative.

## 13. Phase 8 endpoints (as built)

Patient (cookie session + CSRF):

| Method | Path | Notes |
|---|---|---|
| POST | `/shares/preview` | Body `{categories, date_from?, date_to?}`. Returns exactly what a recipient would see. Creates nothing. |
| POST | `/shares` | Body adds `recipient_name, recipient_email, expires_in_hours (1-720), confirm: true`. 201 `{share, link, notification_sent}`; the link is returned once. 409 `SHARE_LIMIT_REACHED` at 20 active shares. |
| GET | `/shares` | Own shares with computed `status` (`active | expired | revoked`). |
| GET | `/shares/{id}/access` | Own share's access log (event and time only). |
| POST | `/shares/{id}/revoke` | Idempotent. Takes effect on the recipient's next request. |
| GET / PUT | `/emergency/settings` | What the emergency summary includes. |
| GET | `/emergency/summary` | Minimum-necessary summary of the patient's own data. Audited (counts only). |
| GET | `/emergency/status` | `{emergency_number, dispatch_available}`. |
| POST | `/emergency/simulations` | Needs `confirm: true` and `understand_simulation: true`. 409 `SIMULATION_OPEN` if one is running. |
| GET | `/emergency/simulations` | Latest 20. Every item has `is_simulation: true` and a notice. |
| POST | `/emergency/simulations/{id}/advance`, `/cancel` | 409 `SIMULATION_FINISHED` when not open. |
| POST | `/emergency/dispatch-requests` | Body `{latitude, longitude, confirm: true}`. 503 `AMBULANCE_PROVIDER_UNAVAILABLE` with no provider. 201 only with a provider reference. |

Recipient (no cookie, no CSRF, rate limited):

| Method | Path | Notes |
|---|---|---|
| POST | `/share-access/start` | Body `{token}`. Always 202 with the same message; a code is emailed only for an active link. |
| POST | `/share-access/verify` | Body `{token, code}`. 200 `{session_token, expires_in_seconds}` or 400 `SHARE_CODE_INVALID` (same for unknown, expired, revoked, wrong or used codes). |
| GET | `/share-access/summary` | Header `X-Share-Session`. 401 `SHARE_SESSION_INVALID`, 403 `SHARE_NOT_ACTIVE` once revoked or expired. |
