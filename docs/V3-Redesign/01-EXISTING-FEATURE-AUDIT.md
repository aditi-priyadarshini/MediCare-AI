# MediCare 360 V3 — Existing Feature Audit

**Source inspected:** `MediCare-AI-main(2).zip`  
**Audit type:** Static source/repository inspection  
**Date:** 19 November 2026  
**Important:** “Present” means code/routes/components exist. It does not mean the feature has passed end-to-end, clinical, security or production validation.

## 1. Repository inventory

| Area | Verified in repository |
|---|---|
| Web frontend | Next.js App Router, React 19, TypeScript, Tailwind 3.4, Lucide |
| Backend | FastAPI with SQLAlchemy/Alembic structure |
| Database | PostgreSQL-oriented models and migrations |
| Mobile | Expo / React Native Android app |
| Tests | Frontend Vitest/Testing Library/axe setup; backend test suite exists |
| Documentation | Product, architecture, API, database, security, testing, limitations and UI redesign docs |

## 2. Existing web routes

### Patient-facing / shared
- `/dashboard`
- `/profile`
- `/records`
- `/labs`
- `/medications`
- `/diet` and `/diet/preferences`
- `/assistant`
- `/care` and `/care/book/[doctorId]`
- `/safety` plus AI, alternatives, authenticity, lookup, medicines and report subroutes
- `/share` and `/share/new`
- `/feedback`
- `/settings`
- `/emergency`
- `/shared`

### Authentication
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/verify-email`

### Administration
- `/admin`
- `/admin/accounts`
- `/admin/ai`
- `/admin/audit`
- `/admin/feedback`
- `/admin/reference`
- `/admin/rules`

### Review item
Inspect `frontend/app/page.tsx` during the first V3 implementation pass and confirm the intended public root behaviour (landing page, redirect or authenticated dashboard). The earlier UI audit recorded a root-page routing concern; verify the current file before changing it.

## 3. Existing backend capability map

| Module | Existing route capability (high-level) | V3 action |
|---|---|---|
| Identity | logout, current user, email verification/resend, OAuth provider start/callback | Harden session lifecycle, recovery, MFA decision and abuse controls |
| Patients | profile, conditions, allergies, emergency contacts, consents | Improve source/provenance and profile UX |
| Records | records CRUD, private file upload/download/delete, lab results/tests/trends, bulk lab entry | Improve upload feedback, document review and trend comparability |
| Scan | scan status and record scan endpoint | Add safe review/confirmation workflow; test OCR failures |
| Medications | medicine catalogue, prescriptions, medication CRUD, schedules, supplies, doses, notifications | Improve adherence flows and reminder reliability |
| Safety | drug-drug, drug-condition, drug-food, allergy checks, warnings, alternatives, authenticity, adverse-event reports | Strongly label source/limitations; clinician-reviewed data gates |
| Assistant | sessions, context settings, messages, evidence | Improve citations, safety boundaries and context transparency |
| Discovery | pharmacy/doctor search, specialties, details, appointment create/list/cancel | Clearly label synthetic data and non-live availability |
| Nutrition | preferences and diet plans | Explain plan provenance and avoid medical diet claims |
| Sharing | preview, create, list, access history, revoke, access verification and summary | Improve consent UX, expiry, recipient identity and audit visibility |
| Emergency | settings, summary, simulation lifecycle, dispatch request | Preserve direct emergency call; clearly label simulated dispatch |
| Calls | device registration, call list, ICE servers, test call, accept/decline/end | Treat as experimental until real device/network validation |
| Admin | users, deactivate/reactivate, audit logs, feedback moderation, medicine catalogue, overview | Add least-privilege roles and stronger audit safeguards |

## 4. Existing frontend component families

- `components/layout/`: AppShell, Sidebar, MobileNavigation, Topbar, Breadcrumbs, DisplayToggles, ExperienceMenu, NotificationPanel, SearchCommand, UserMenu.
- `components/dashboard/`: TodayCard, UpcomingCard, QuickActions, HealthTimeline, LabHighlights, ProfileCompletion, AI panel and related widgets.
- `components/health/`: profile fields, forms, navigation and sections.
- `components/records/`: record upload, camera capture, scan capture, lab forms/import, lab cards, trends and drawers.
- `components/medications/`: add-medication flow, medication details/cards, dose/schedule/supply and alert components.
- `components/assistant/`: assistant view, composer, context controls/chips, messages, evidence and sessions.
- `components/safety/`: interaction checks, authenticity, alternatives, warnings, report and AI review panels.
- `components/care/`: doctor finder, pharmacy finder, booking form and appointments.
- `components/admin/`: accounts, providers, audit, feedback, reference data and rules.
- `components/ui/`: shared primitives, forms, dialogs/drawers, tabs, toast, popover, menu, error/empty states and page headers.
- `components/voice/`: voice input, voice command and read-aloud controls.

**Audit implication:** Do not create a second design system or duplicate components. First map existing primitives and page-specific patterns; consolidate and improve them.

## 5. Existing mobile application

The repository includes a real Android client, not just a placeholder:
- Expo / React Native app.
- Five bottom tabs: Home, Medicines, Ask AI, Records and More.
- Screens for home, medicines, assistant/chat, records/lab detail, profile, safety, care, emergency, sharing, notifications and settings.
- A small custom navigator with per-tab stacks and Android hardware-back handling.
- Session/API client and theme/preferences context.
- Incoming call registration and call UI, WebRTC-related modules, Notifee and Firebase dependencies.

See `03-MOBILE-APP-V3-ROADMAP.md` for what should be improved and what must be proven on real devices.

## 6. Gaps and risks to address

### P0 — Safety, privacy and correctness
1. **Production security review:** repository limitations explicitly say there has been no independent penetration test or privacy-law review.
2. **Uploads:** malware scanning is not present; current documentation says type/size validation only.
3. **Rate limiting:** documented as in-process memory; move to shared storage such as Redis before horizontal scaling.
4. **Admin MFA:** documented as absent; decide whether mandatory for real deployment.
5. **AI medical claims:** model-generated medical content and safety suggestions are not clinician validated. Make this unmistakable and gate any clinical reference dataset behind qualified review.
6. **Synthetic data:** doctors, pharmacies, prices and medicine reference data are documented as synthetic demonstration data. Never imply live data.
7. **Emergency dispatch:** dispatch simulation is not a real ambulance integration.
8. **Reminder calling:** docs state FCM/APNs VoIP, TURN, aiortc and real device paths have not been validated against live services/devices.

### P1 — Product completeness and UX
1. Establish a single end-to-end patient journey from registration to profile completion, first record, medicine schedule and first successful reminder.
2. Make the dashboard useful without inventing health scores or insights.
3. Improve empty states and action-led onboarding for first-time users.
4. Ensure every action gives clear progress, success, failure and retry feedback.
5. Standardize list/table patterns, filtering, sorting, pagination and bulk actions.
6. Add notification preferences, delivery status and a clear notification history.
7. Improve sharing consent, recipient verification, expiry, revoke and access-history visibility.
8. Complete localization coverage; the repo's limitations doc notes some pages remain English-only and machine-generated Hindi/Odia need native review.
9. Improve web/mobile parity and document which flows are mobile-only or web-only.

### P2 — Optimization and polish
1. Split oversized feature components into page orchestration + smaller domain components.
2. Reduce repeated API calls and avoid loading full feature data when only counts are needed.
3. Audit client components and move static/data-only UI to server components where practical.
4. Add image/file upload progress and robust retry.
5. Add skeletons, optimistic updates only where rollback is safe, and cache invalidation tests.
6. Add production observability without logging PHI.
7. Add realistic performance budgets and load testing.

## 7. Verification matrix

| Feature | Static presence | Must still verify |
|---|---|---|
| Authentication | Routes/components and identity endpoints | register/login/reset/verify/OAuth/session expiry, abuse throttling |
| Profile/conditions/allergies | Pages/components and API | ownership, validation, persistence, consent and provenance |
| Records/upload/scan | Pages/components and API | file size/type/content checks, malware scanning, private access, OCR accuracy and review |
| Labs/trends | Pages/components and API | units, reference ranges, comparable series, date/time correctness |
| Medicines/doses | Pages/components and API | timezone/DST, duplicate dose prevention, explicit taken action, schedule edits |
| Safety | Pages/components and API | clinical source/version, false negatives, disclaimer visibility, report lifecycle |
| Assistant | UI and session/message/evidence API | live provider integration, prompt injection, context isolation, citation quality |
| Care discovery | UI and API | whether data is synthetic or live, search accuracy, appointment lifecycle |
| Sharing | UI and API | token entropy, expiry, revoke immediacy, access logs, scope enforcement |
| Emergency | UI and API | tel:112 behaviour, simulation labels, no misleading live status |
| Reminder calls | mobile and backend code | FCM setup, Android background behaviour, TURN, real network/device calls |
| Admin | UI and API | role boundaries, MFA, audit integrity, sensitive data minimization |

## 8. Audit rules for developers

- Never mark a feature “working” from a route or component alone.
- For each feature, record: code present, unit tests, integration tests, browser/device test, external dependency status and known limitation.
- Do not replace a failing API with hardcoded demo data.
- Preserve existing API contracts unless a versioned migration is approved.
- Any schema change requires an Alembic migration, rollback plan and data migration test.
- Any change to AI/safety/emergency copy requires a safety review.
