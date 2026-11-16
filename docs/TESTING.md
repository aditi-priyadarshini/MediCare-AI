# Testing & Quality Plan

## 1. Testing pyramid

- Unit tests: validation, date/unit helpers, interaction matching, permission functions.
- Integration tests: database, auth, medication schedules, lab ingestion, share grants.
- API tests: status codes, schemas, pagination, authorization and error cases.
- E2E tests: registration through patient workflows.
- Security tests: IDOR, privilege escalation, upload handling, session and rate limits.
- AI evaluations: factual grounding, evidence citations, uncertainty and unsafe medical advice refusal.

## 2. Critical test scenarios

### Authentication
- Valid and invalid login.
- Expired/reused OTP rejected.
- OTP rate limit enforced.
- OAuth state mismatch rejected.
- Logout invalidates session.

### Patient isolation
- Patient A cannot read/update/delete Patient B's profile.
- Patient A cannot access Patient B's reports, observations, medication, chat, dose logs or emergency details.
- Random UUID does not bypass ownership.
- Admin role is required for admin endpoints.

### Medication and reminders
- Schedule generates expected occurrences in patient's timezone.
- Worker retry does not duplicate notifications.
- Notification delivery does not create a taken dose.
- Dose log is linked to correct medication and patient.
- Archived medication preserves history.

### Lab observations
- OCR extraction remains unconfirmed.
- User can correct extracted value/unit/date.
- Comparable values produce trend.
- Incompatible units are not charted together.
- Reference range comes from report/source.
- Out-of-range display is not a diagnosis.

### Drug safety
- Ingredient pair matches in either order.
- Severity and source metadata are returned.
- Unknown dataset coverage is explicit.
- No matching record is not labelled safe.
- Conflicting reference data is surfaced.

### AI
- AI cites the actual patient records used.
- AI does not claim medication caused a lab change.
- AI refuses dose-change instructions.
- AI reports missing adherence data.
- AI handles contradictory values.
- Uploaded prompt injection is ignored.
- Context-off means no patient record retrieval.

### Sharing
- Expired link denied.
- Revoked link denied.
- Wrong recipient denied.
- Only selected record types accessible.
- Every access is logged.

### Emergency
- Demo mode always shows simulation label.
- No "confirmed" status without provider response.
- Location is not shared without permission.
- Emergency information remains accessible without requiring AI.

## 3. Tooling

- Backend: Pytest, HTTPX test client, factory fixtures.
- Frontend: Vitest and React Testing Library.
- E2E: Playwright.
- Lint/type: Ruff, mypy (optional), ESLint, TypeScript.
- Security: Bandit, pip-audit, npm audit, OWASP ZAP baseline.
- CI: run lint, type checks, unit tests and integration tests on pull request.

### Admin and release (Phase 9)
- Every route: anonymous 401, patient 403 on admin, CSRF required, random ids never succeed.
- Rule versioning: supersede links and retires atomically; failed supersede leaves the old rule active; second-person review refuses the author (API and database).
- Audit log: append-only at the database; viewer scope; filters escape wildcards.
- Accounts: deactivation signs the user out and blocks login; no self-deactivation.
- Feedback: isolation between patients, moderation, no message text in audit rows, rate limit.
- Release: demo seed is synthetic and idempotent and refuses production; headers; cookie flags; secrets scan; production config guards.
- Accessibility: `vitest-axe` on every new component, plus a live-browser axe-core run (incl. colour contrast) over the built app.

Run it: `cd backend && ruff check . && ruff format --check . && pytest && bandit -r app -ll && pip-audit -r requirements.txt`; `cd frontend && npm run lint && npm run typecheck && npm test && npm run build && npm audit --omit=dev`.

## 4. Release gate

A feature is not Done because the page renders. It is Done only when:
- UX states exist: loading, empty, error, success.
- API and persistence work.
- Authorization is tested.
- Validation and error handling exist.
- Accessibility is reviewed.
- Automated tests pass.
- Documentation is updated.
