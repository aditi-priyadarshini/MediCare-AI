# Delivery Phases & Implementation Roadmap

**Constraint:** Solo developer. Build as a modular monolith.  
**Planning estimate:** 12–16 weeks for a substantial academic demo, depending on available hours and provider integrations. Real clinical/provider integrations can extend this significantly.

## Delivery principles

- Build vertical slices, not disconnected UI screens.
- Each phase must include frontend, API, database, tests and documentation.
- Use synthetic seed data.
- Do not begin with the AI chatbot.
- Do not integrate real emergency dispatch until a provider relationship exists.
- Keep all clinical reference data limited, sourced and explicit about coverage.

## Phase 0 — Product foundation (2–3 days)

Tasks:
- Create repository and branch protections.
- Create docs folder and maintain this specification.
- Initialize Next.js + TypeScript.
- Initialize FastAPI + Pydantic.
- Configure PostgreSQL, SQLAlchemy and Alembic.
- Add Docker Compose.
- Configure linting, formatting, `.env.example` and CI.
- Add health checks and structured logging.

Exit criteria:
- One command starts the local stack.
- Frontend reaches backend health endpoint.
- Database migration runs on a clean database.
- CI runs lint and smoke tests.

## Phase 1 — Authentication and patient profile (1–2 weeks)

Tasks:
- Registration, email/password login and logout.
- Email verification/OTP.
- Google OAuth.
- Password reset and rate limits.
- Patient profile.
- Conditions, allergies, emergency contacts.
- Consent and accessibility preferences.
- Basic admin role.

Exit criteria:
- Auth flows work.
- Secure session handling.
- Ownership tests pass.
- Sensitive data is not logged.

## Phase 2 — Health records and longitudinal observations (1–2 weeks)

Tasks:
- Private document upload.
- Document metadata and categories.
- OCR extraction adapter.
- Human review/confirmation workflow.
- Structured vitals and lab observations.
- Reference range and unit storage.
- Observation history and comparable trend charts.
- Export basic patient summary.

Exit criteria:
- Original files remain private.
- OCR never silently creates confirmed results.
- Trend charts show dates, units and provenance.
- Incomparable units/tests are not graphed together.

## Phase 3 — Medication tracker and reminders (1–2 weeks)

Tasks:
- Medicine catalogue baseline.
- Personal medication records.
- Prescription vs medication statement distinction.
- Schedules and reminders.
- Dose logs.
- Refill and expiry alerts.
- Batch and lot information.
- Notification worker.

Exit criteria:
- Patient can create schedule and log dose.
- Dose is not marked taken automatically.
- Reminder generation is idempotent.
- Time zones and daylight-saving edge cases are tested.

## Phase 4 — Medicine safety and comparison (2 weeks)

Tasks:
- Ingredient-based catalogue model.
- Curated interaction rules.
- Drug-drug, food, condition and allergy checks.
- Severity and unknown outcomes.
- ADR reporting.
- Generic candidate matching.
- Price comparison with timestamps and pack normalization.
- Authenticity verification adapter with explicit unsupported state.

Exit criteria:
- Every safety result includes source/version/review date.
- Missing data returns unknown/no matching data, never safe.
- Alternatives are labelled candidates.
- No authenticity claim without authoritative verification.

## Phase 5 — AI assistant and patient context (1–2 weeks)

Tasks:
- LLM provider adapter.
- Retrieval service for medicine reference and patient records.
- Patient context consent controls.
- Chat sessions and messages.
- Source/citation metadata.
- Longitudinal lab and medication timeline prompts.
- Safety policy and evaluation tests.
- Prompt-injection resistance for uploaded documents.

Exit criteria:
- AI only sees authorized records.
- Every patient-record statement is traceable to record/date.
- Assistant distinguishes association from causation.
- No diagnosis/prescribing.
- Missing data and uncertainty are explicit.

## Phase 6 — Voice and accessibility (1 week)

Tasks:
- Speech-to-text adapter.
- Text-to-speech adapter.
- English, Hindi and Odia UI strings.
- Large-text and high-contrast mode.
- Voice action confirmation.
- Screen-reader and keyboard review.

Exit criteria:
- Core workflows remain usable without voice.
- Voice does not silently alter medicine data.
- Language fallback is clear.

## Phase 7 — Pharmacy, doctor and diet discovery (1–2 weeks)

Tasks:
- Map/list interface.
- Pharmacy directory and source metadata.
- Inventory adapter contract.
- Doctor directory and credential status.
- Appointment request workflow.
- Diet preferences and educational planner.
- Data freshness labels.

Exit criteria:
- No fabricated stock or appointment status.
- Map provider usage follows terms.
- Doctor credentials are labelled verified/unverified.
- Diet suggestions show limitations.

## Phase 8 — Sharing and emergency workflows (1–2 weeks)

Tasks:
- Patient-selected medical summary.
- Time-limited share grants.
- Recipient verification.
- Revocation and access logs.
- Emergency contacts.
- Location permission.
- Emergency summary.
- Simulated ambulance lifecycle.
- Provider integration interface.

Exit criteria:
- Share links are unguessable, expiring and revocable.
- Access is logged.
- Emergency action is deliberate.
- Demo ambulance clearly states no real dispatch.

## Phase 9 — Admin, security, QA and release (1–2 weeks)

*Status: done. See README "Phase 9 notes" for what was built and what was not.*

Tasks:
- Admin catalogue and source management.
- Interaction-rule versioning.
- Feedback moderation.
- Audit review.
- Full authorization testing.
- OWASP-aligned security checks.
- Performance and accessibility pass.
- Documentation, demo data and presentation.

Exit criteria:
- All release-blocking tests pass.
- No known cross-user data access.
- No secrets in repository.
- Demo data is synthetic.
- Known limitations are documented.

## Priority matrix

| Priority | Meaning | Examples |
|---|---|---|
| P0 | Required for safe MVP | Auth, patient isolation, health records, medication records, reminders, audit |
| P1 | Core project value | Lab trends, interaction checker, AI record explanation, secure sharing |
| P2 | Important extension | OCR, voice, pharmacy and doctor discovery, diet planner |
| P3 | Integration-dependent | Live inventory, real appointments, authenticity source, ambulance dispatch |

## Sprint 1 — Exact task list

1. Initialize Git repository.
2. Create `frontend/` Next.js app.
3. Create `backend/` FastAPI app.
4. Add PostgreSQL service to Compose.
5. Add SQLAlchemy and Alembic.
6. Add configuration and environment validation.
7. Create user and session models.
8. Implement registration/login/logout.
9. Add initial patient profile model and endpoints.
10. Build login, onboarding and dashboard shell.
11. Add tests for registration, login and cross-user profile access.
12. Add CI workflow.

Do not add AI, maps or ambulance UI in Sprint 1.

## Solo developer time management

Suggested weekly split:
- 60% implementation
- 20% automated tests and debugging
- 10% documentation
- 10% design/accessibility review

Keep a visible issue board with `Backlog`, `Ready`, `In Progress`, `Review`, `Done`, and `Blocked`.
