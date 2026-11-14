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
| GET | `/safety/medicines/{id}/adverse-effects` | Adverse effect reference |
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
| DELETE | `/assistant/sessions/{id}` | Delete chat |

## 8. Discovery and providers

| Method | Path | Purpose |
|---|---|---|
| GET | `/pharmacies/search` | Search pharmacies |
| GET | `/pharmacies/{id}` | Pharmacy detail |
| GET | `/pharmacies/{id}/inventory` | Inventory if integrated |
| GET | `/doctors/search` | Search doctors |
| GET | `/doctors/{id}` | Doctor detail |
| POST | `/appointments` | Request appointment |
| GET | `/appointments` | List appointments |

## 9. Diet, sharing and emergency

| Method | Path | Purpose |
|---|---|---|
| GET/PUT | `/diet/preferences` | Preferences |
| GET/POST | `/diet/plans` | List/create educational plan |
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
- `/admin/providers`
- `/admin/feedback`
- `/admin/audit-logs`

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
