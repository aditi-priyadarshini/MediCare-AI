# Phase A — Audit & Baseline

**Goal:** know exactly what exists before changing anything, and prove the starting point is green.
**Depends on:** nothing. **Size:** S. **Branch:** `ui/a-audit`. **Code changes:** none (docs only).

## Scope
Every file under `frontend/app`, `frontend/components`, `frontend/lib`, `frontend/tests`.

Known starting facts (verify, do not trust):
- Routes in `(app)`: `dashboard, profile, records, labs, medications, diet, assistant, care, safety, share, feedback, onboarding`, and `admin` with sub-pages `accounts, ai, audit, feedback, reference, rules`.
- Routes in `(auth)`: `login, register, forgot-password, reset-password, verify-email`. Standalone: `/emergency`, `/shared` (public share viewer), `not-found`. Confirm what `/` (`app/page.tsx`) renders.
- Shell is `components/layout/AppShell.tsx`: one flat `NAV` list, an `EXTRA` list (Feedback, Admin), `DisplayToggles` (large text + contrast), `VoiceCommandBar`, a horizontally scrolling mobile bottom bar with 10+ items.
- Dashboard (`app/(app)/dashboard/page.tsx`) fires six `limit=1` count calls and shows count cards plus a placeholder `COMING` list.
- Notifications exist in the API (`/notifications`, `/notifications/read-all`, `/notifications/{id}/read`) but are only shown in `components/medications/AlertsCard.tsx`.
- No streaming in the assistant API. No `/settings` route. No caregiver backend.
- Design tokens live in `app/globals.css` (CSS variables) and `tailwind.config.ts`.

## Tasks
- [ ] Install and run baseline: `npm ci && npm run lint && npm run typecheck && npm test && npm run build`. Record exact results (pass/fail counts, warnings, build size per route). Any failure here is **pre-existing**.
- [ ] Route inventory table: route → file → purpose → API endpoints used → components → existing tests → i18n coverage (translated or English-only).
- [ ] Component inventory: which primitives exist, which feature components are oversized (largest: `EmergencyPanel` 471 lines, `MedicationDetails` 339, `health/sections` 325, `primitives` 316) and what should be split.
- [ ] UX problem list per screen (hierarchy, empty/loading/error handling, mobile overflow, target sizes, repeated card patterns, dead/placeholder UI).
- [ ] Hardcoded styling audit: raw hex or ad-hoc Tailwind colours not using tokens; places that bypass `primitives.tsx`.
- [ ] Accessibility baseline: run axe over each page in tests or a browser; record violations. Note contrast of palette pairs (amber `#B7791F` and mint `#38BFA7` as text on white will fail AA).
- [ ] Mobile baseline: screenshots at 320, 375, 768, 1280 widths for every route; note horizontal overflow.
- [ ] Preferences audit: how `large_text`, `high_contrast`, `reduce_motion`, `voice_enabled`, language are stored and applied (`lib/profile-context.tsx`, `lib/i18n/index.tsx`).
- [ ] Decide and log in the README: profile page split ("Profile" vs "Health Profile"), where Experience mode is stored, whether a Geist font can be self-hosted.

## Deliverables
`docs/UI_REDESIGN/AUDIT.md` containing the tables above, the baseline command output summary, and a prioritised issue list mapped to phases B–G. Screenshots in `docs/UI_REDESIGN/audit-shots/` (optional but recommended).

## Exit criteria
- Baseline results recorded honestly, including failures.
- Every route has an audit row; none skipped.
- Every issue is assigned to a later phase.
- No source files changed.

## Handoff
List: the pre-existing failures, the decisions made, and anything that blocks Phase B.

## Paste-ready prompt
```
Read docs/UI_REDESIGN/README.md and 00-MASTER-SPEC.md, then do Phase A from
docs/UI_REDESIGN/PHASE-A-audit.md. Do not change source code. Run the baseline
checks from frontend/ and report results exactly, including pre-existing failures.
Write docs/UI_REDESIGN/AUDIT.md. Cover every route, including /admin sub-pages,
/emergency, /shared and /. Verify each "known starting fact" rather than assuming it.
```
