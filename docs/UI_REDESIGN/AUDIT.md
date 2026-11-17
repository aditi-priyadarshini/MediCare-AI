# Phase A — Audit & Baseline

Run on 2026-11-16 against the uploaded `MediCare-AI-main.zip`. No source files were changed.
**Not done in this pass (needs a browser):** axe over live pages, screenshots at 320/375/768/1280, manual contrast measurement. These are listed under "Still to do" and must not be reported as done.

## 1. Baseline (from `frontend/`)

| Check | Result |
|---|---|
| `npm ci` | OK |
| `npm run lint` | Pass, no warnings. Note: `next lint` is deprecated and removed in Next 16. |
| `npm run typecheck` | Pass |
| `npm test` | **18 files, 177 tests, all pass.** React `act(...)` warnings are printed (e.g. `PlansCard`); noisy, not failing. |
| `npm run build` | Pass, 30 static pages. Shared First Load JS 103 kB. Heaviest routes: `/medications` 125 kB, `/assistant` 123 kB, `/onboarding` 120 kB, `/profile` 119 kB. |

**Pre-existing failures: none.**
Correction to the docs: the spec says "19 existing test files". `tests/` has 19 entries, but one is `setup.ts`, so there are **18 test files**.

## 2. Known starting facts, verified

| Claim | Verdict |
|---|---|
| Routes in `(app)` as listed | Confirmed, plus `admin` sub-pages. |
| `/` (`app/page.tsx`) | **Bug.** It renders `AdminOverviewCard`, identical to `/admin`. The public root is an admin screen, not a landing or redirect. |
| Shell is one flat `NAV` + `EXTRA` list | Confirmed. Labels in `EXTRA` ("Feedback", "Admin") are hardcoded English. |
| Dashboard fires six `limit=1` calls and has a placeholder `COMING` list | Confirmed (`conditions, allergies, emergency/contacts, records, labs, medications`; section "Coming in later releases"). |
| Notifications API only used in `AlertsCard` | Confirmed. |
| No `/settings` route | Confirmed. |
| Tokens in `globals.css` + `tailwind.config.ts` | Confirmed. |

## 3. Route inventory

| Route | Page file | Main components | i18n |
|---|---|---|---|
| `/` | `app/page.tsx` | `AdminOverviewCard` (wrong) | English only |
| `/login /register /forgot-password /reset-password /verify-email` | `app/(auth)/*` | `LoginForm`, `GoogleButton`, primitives | English only |
| `/onboarding` | `(app)/onboarding` | `brand`, `ProfileFields`, `health/sections` | Partly (health area uses i18n) |
| `/dashboard` | `(app)/dashboard` | primitives only; 6 count calls | English only |
| `/profile` | `(app)/profile` | `ProfileFields`, `health/sections` (325 lines) | Partly |
| `/records`, `/labs` | `(app)/records`, `(app)/labs` | `RecordsSection` (261), `LabsSection` (211), `TrendChart` | English only |
| `/medications` | `(app)/medications` | `MedicationsCard`, `DosesCard`, `AlertsCard`, `MedicationDetails` (339) | Dose reading translated |
| `/diet` | `(app)/diet` | `PreferencesCard`, `PlansCard` | English only |
| `/assistant` | `(app)/assistant` | `AssistantView`, `ContextControls`, `EvidenceList` | Input and safety text translated |
| `/care` | `(app)/care` | `DoctorFinder` (261), `PharmacyFinder`, `AppointmentsPanel` | English only |
| `/safety` | `(app)/safety` | `CheckCard`, `AuthenticityCard`, `AlternativesCard`, `ReportCard` | English only |
| `/share` | `(app)/share` | `CreateShareCard`, `ShareList` | English only |
| `/feedback` | `(app)/feedback` | `FeedbackForm` | English only |
| `/admin` + `accounts, ai, audit, feedback, reference, rules` | `(app)/admin/*` | `components/admin/*` | English only |
| `/emergency` | `app/emergency` | `EmergencyPanel` (471, largest) | English only (two nav labels aside) |
| `/shared` | `app/shared` | `SharedClient`, `SharedSummaryView` | English only |
| `not-found` | `app/not-found.tsx` | none | English only |

i18n coverage is concentrated in `layout`, `voice`, `assistant`, `health`, `medications`. Everything else is English.

## 4. Component inventory

- Primitives exist in `components/ui/primitives.tsx` (316 lines): Button, FieldShell, TextField, PasswordField, SelectField, CheckboxField, Card, Alert, VerificationBadge, Skeleton, PageLoading, EmptyState.
- **Missing (all Phase B):** StatusBadge, SourceBadge, ErrorState, Dialog/ConfirmationDialog, Toast, StepProgress, PageHeader, Tabs, Menu.
- **Oversized, split candidates:** `EmergencyPanel` 471, `MedicationDetails` 339, `health/sections` 325, `primitives` 316, `MedicationsCard` 271, `RecordsSection` 261, `DoctorFinder` 261.

## 5. Hardcoded styling

- 1 raw hex in `.tsx` files.
- 26 ad-hoc Tailwind palette classes (`red-*`, `amber-*`, `green-*` etc.) bypassing tokens. Each needs checking against the "status is never colour-only" rule.

## 6. Preferences

- `profile-context.tsx` writes `data-large-text`, `data-contrast`, `data-reduce-motion` on `<html>` from profile fields `large_text`, `high_contrast`, `reduce_motion`. Language comes from `preferred_language`.
- `voice_enabled` is a profile field but I did not find it applied via `data-*`; it is read by the voice components.
- **Fonts:** `tailwind.config.ts` lists "Inter, Geist Sans, system-ui…" but `app/layout.tsx` has **no `next/font`**, so Inter is never loaded. Users get whatever system font matches. Phase B should self-host Inter.

## 7. UX problems (first pass, from code)

| # | Issue | Phase |
|---|---|---|
| 1 | `/` shows the admin overview to the public | F (and a hotfix candidate now) |
| 2 | Dashboard is six count cards + a "Coming in later releases" placeholder; no next action | D1 |
| 3 | Flat 10-item nav, no groups; mobile bottom bar scrolls horizontally with 10+ items | C |
| 4 | `/care` and `/share` have distinct pages but ambiguous labels; "Profile" and "Health Profile" share `/profile` | C |
| 5 | No Settings page; display toggles live in the shell only | C |
| 6 | Notifications hidden inside the medications page | C |
| 7 | `EXTRA` nav labels hardcoded English | C |
| 8 | Most pages are untranslated English | per-page phases (log, not blocking) |
| 9 | Inter not loaded | B |
| 10 | 26 ad-hoc colour classes | B, then each page phase |
| 11 | Oversized components | D2, E2 |

## 8. Decisions logged (proposed, for the README decision table)

| # | Decision |
|---|---|
| 7 | Keep one `/profile` page for now; label it "Health Profile" in nav. Revisit a split in D2 only if the page is too long. |
| 8 | Store Experience mode in `localStorage` (try/catch, default Standard). No existing profile field holds it and backend changes are out of scope. |
| 9 | Self-host Inter with `next/font/google` (downloaded at build time, no runtime request). Do not add Geist. |

## 9. Still to do before closing Phase A

- [ ] axe pass over each route in a browser (the unit tests only cover some components).
- [ ] Screenshots at 320 / 375 / 768 / 1280 and horizontal overflow notes.
- [ ] Measured contrast table for pairs actually used.
- [ ] Confirm `voice_enabled` handling.

## Handoff

- Pre-existing failures: none.
- Blockers for Phase B: none.
- Urgent outside the redesign: `/` rendering `AdminOverviewCard`.
