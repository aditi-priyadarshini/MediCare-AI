# MediCare 360 V3 — Implementation Roadmap

## Delivery strategy

Do not rebuild the whole app in one giant change. Ship V3 in controlled phases with a working main branch after each phase. Preserve existing backend behaviour unless a documented requirement needs a versioned API or migration.

## Phase 0 — Baseline and product decisions

**Goal:** establish what works today.

Tasks:
- Run frontend lint, typecheck, unit tests and production build.
- Run backend tests and migration checks.
- Run Android typecheck and clean build.
- Capture screenshots of all web routes at phone/tablet/desktop widths.
- Test the core user journeys against a running environment.
- Mark each feature as code-present, unit-tested, integration-tested, browser/device-tested and externally validated.
- Confirm root `/` behaviour.
- Confirm which catalogue/provider data is synthetic.
- Record environment variables and external dependencies without exposing secrets.

Exit criteria:
- Baseline report with actual command output.
- No undocumented pre-existing failures.
- Feature verification matrix completed for core journeys.

## Phase 1 — Design system and frontend foundation

**Goal:** create a consistent, modern UI foundation.

Tasks:
- Audit current CSS variables and existing `components/ui` primitives.
- Consolidate semantic tokens and typography.
- Standardize buttons, fields, cards, badges, dialogs, drawers, menus, tabs, toast, skeleton, empty/error states.
- Adopt selected 21st.dev-inspired patterns only after accessibility and dependency review.
- Define responsive breakpoints and layout constraints.
- Add Storybook or an equivalent component showcase only if it materially helps development; do not add tooling by default.
- Add visual regression snapshots for critical components.

Exit criteria:
- Component inventory and usage guidance.
- Tokens applied to representative routes.
- No duplicated primitive set.
- Accessibility tests for core primitives pass.

## Phase 2 — App shell and navigation

**Goal:** make the product feel coherent and easy to navigate.

Tasks:
- Refine sidebar groups, active states and collapse behaviour.
- Refine topbar, global search/command menu, notifications and user menu.
- Ensure responsive mobile navigation.
- Keep admin navigation isolated.
- Verify every nav link and keyboard path.
- Confirm Settings consolidates preferences without duplicating controls.

Exit criteria:
- All routes reachable and role-gated.
- No dead links or inaccessible icon-only controls.
- Mobile navigation works at 320px.

## Phase 3 — Patient dashboard and onboarding

**Goal:** help a new user reach first value.

Tasks:
- First-run onboarding checklist.
- Profile completion without unnecessary form overload.
- Dashboard “Today” panel from real backend data.
- Due dose and recent activity panels.
- Action-first empty states.
- Avoid invented health scores and fake insights.

Exit criteria:
- New user can complete onboarding and understand next steps.
- Returning user sees real current information.
- Independent widget failure does not blank the whole dashboard.

## Phase 4 — Health data workflows

**Goal:** improve profile, records and labs.

Tasks:
- Profile provenance and consent UX.
- Record upload, progress, validation, preview and retry.
- OCR review/confirmation and correction history.
- Lab entry/import and comparable trend logic.
- Accessible table alternatives.
- Large-file and weak-network tests.

Exit criteria:
- Uploaded files remain private.
- Imported data is visibly unverified until confirmed.
- Lab charts only compare valid series.
- CRUD persists across reload and ownership tests pass.

## Phase 5 — Medication and safety workflows

**Goal:** make medication management dependable.

Tasks:
- Improve medicine/prescription entry.
- Improve schedule and dose interaction.
- Add explicit dose confirmation and clear correction flow.
- Improve supply/refill and alerts.
- Improve safety check result language and evidence/provenance.
- Add adverse-event report flow.
- Validate timezone, duplicate actions and idempotency.

Exit criteria:
- Dose state changes only after user action.
- Schedule and notification states are not conflated.
- No “all clear/safe” result from missing data.
- Safety limitations remain visible.

## Phase 6 — AI assistant and care tools

**Goal:** make AI transparent and care discovery honest.

Tasks:
- Refine context selection and context summary.
- Improve evidence panel and citations.
- Add prompt-injection and data-isolation tests.
- Improve doctor/pharmacy discovery and appointment lifecycle.
- Label synthetic providers and inventory.
- Improve share recipient, expiry, scope, revoke and access history.

Exit criteria:
- AI only receives selected/authorized context.
- No fabricated citations or provider availability.
- Sharing permissions are enforced by backend tests.

## Phase 7 — Android mobile V3

**Goal:** deliver reliable daily use on Android.

Tasks:
- Refresh visual design and navigation.
- Improve medicine-first home experience.
- Improve scan/upload and lab presentation.
- Improve notifications and settings.
- Harden secure storage and logout cleanup.
- Validate FCM/Notifee and WebRTC calls on physical devices.
- Add offline indicators and safe cache strategy.
- Verify TalkBack, font scaling and Android back behaviour.

Exit criteria:
- Clean Android build.
- Core journeys pass on physical devices.
- Notification and call limitations are honestly documented.
- No PHI leakage in logs or lock-screen payloads.

## Phase 8 — Security, performance and release readiness

**Goal:** prepare for a controlled pilot.

Tasks:
- Independent security review / penetration test.
- Upload malware scanning and shared rate limiting.
- Review admin MFA and least privilege.
- Review secrets, CSP, cookies, CORS, trusted proxy and session invalidation.
- Load test API and database with realistic synthetic fixtures.
- Review backups, restore, retention and deletion.
- Review privacy policy, consent and applicable legal obligations with qualified counsel.
- Review AI and clinical content with qualified professionals before any real clinical use.
- Verify production monitoring and incident response.

Exit criteria:
- No unresolved critical/high security findings.
- Backup restore tested.
- Load/performance results documented.
- Privacy and clinical limitations approved for the intended pilot.
- Rollback plan and release checklist complete.

## Priority matrix

| Priority | Work |
|---|---|
| P0 | Security/privacy, data correctness, dose correctness, emergency correctness, authorization, upload safety |
| P1 | Dashboard, records/labs, medication UX, notifications, mobile reliability, AI transparency |
| P2 | Visual polish, advanced animations, personalization, additional analytics |
| Later | Caregiver profiles, doctor portal, real provider integrations, multilingual voice, broader clinical workflows — only after backend, governance and partner requirements exist |

## Team/agent execution rules

- One phase per branch or isolated workstream.
- Start every phase by reading this roadmap and the feature audit.
- Inspect the existing implementation before editing.
- Do not delete features to make a redesign easier.
- No mock API replacement in production paths.
- No schema change without migration and rollback plan.
- Keep a change log and screenshots.
- Run tests after each meaningful feature, not only at the end.
- Report exactly which checks ran and which did not.
- Do not claim production readiness from a successful local build.

## Suggested coding-agent master prompt

> You are implementing MediCare 360 V3 in the existing repository. First read `docs/V3/00-V3-MASTER-PLAN.md`, `01-EXISTING-FEATURE-AUDIT.md`, `02-UI-UX-AND-FRONTEND-SPEC.md`, `03-MOBILE-APP-V3-ROADMAP.md` and `04-IMPLEMENTATION-ROADMAP.md`. Inspect the current code before changing anything. Preserve all existing features, API contracts, auth/session behaviour, patient privacy, safety constraints and localization. Use 21st.dev only as a source of patterns; adapt components into the existing design system and review accessibility, dependencies and bundle impact. Work only on the assigned phase. Do not fabricate data or replace real API calls with mocks. Add tests, run the required checks, document any failures honestly and provide changed-file list, screenshots, test results, risks and remaining work. Stop and ask before any breaking API/schema change or any change that weakens clinical safety or privacy.
