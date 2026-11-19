# MediCare AI — UI/UX Redesign: Phase Plan

This folder turns the master redesign brief into **independent, phase-wise work packages**. Each phase file is self-contained: goal, dependencies, scope (real file paths), task checklist, exit criteria, and a **paste-ready prompt** you can hand to a coding agent (or follow yourself).

Read `00-MASTER-SPEC.md` once. After that, work one phase at a time.

> This track is separate from the backend roadmap in `../PHASES.md` (Phases 0–9, all done). To avoid confusion, redesign phases are lettered **A–G**.

## Phase map

| Phase | File | Outcome | Depends on | Size |
|---|---|---|---|---|
| A | `PHASE-A-audit.md` | Written audit + baseline (tests/build green, screenshots, inventory) | — | S |
| B | `PHASE-B-design-system.md` | Tokens, typography, primitives, preferences system, motion rules | A | M |
| C | `PHASE-C-app-shell.md` | Sidebar, topbar, mobile nav, notifications, command palette, settings page | B | M |
| D1 | `PHASE-D1-dashboard-onboarding.md` | New dashboard + multi-step onboarding | C | L |
| D2 | `PHASE-D2-health-data.md` | Profile, Records, Labs, Medications | C (D1 not required) | L |
| E1 | `PHASE-E1-assistant.md` | AI assistant interface | C | M |
| E2 | `PHASE-E2-safety-care-sharing.md` | Safety, Diet, Care, Share, Feedback, Emergency, Shared | C | L |
| F | `PHASE-F-admin-auth.md` | Admin console, login/register/recovery/verify, 404 | B (C for admin) | M |
| G | `PHASE-G-polish-validation.md` | a11y, responsive, motion, tests, build, final report | all | M |

```
A → B → C ─┬→ D1 ─┐
           ├→ D2 ─┤
           ├→ E1 ─┼→ G
           ├→ E2 ─┤
           └→ F ──┘
```

After Phase C, phases D1, D2, E1, E2 and F do not depend on each other and can be done in any order (or in parallel branches). Phase B is the only hard gate for visual consistency: **do not start page work before B and C are merged.**

## Status tracker (update as you go)

| Phase | Status | Branch | PR | Notes |
|---|---|---|---|---|
| A | ◐ Code audit + baseline done; browser checks pending (see AUDIT.md §9) | `ui/a-audit` | | Baseline green, 177 tests |
| B | ✔ Done (see handoff in PHASE-B file) | `ui/b-design-system` | | 192 tests pass, build green |
| C | ✔ Done (see handoff in PHASE-C file) | `ui/c-app-shell` | | 217 tests pass, build green; no live browser check yet |
| D1 | ✔ Done (see handoff in PHASE-D1 file) | `ui/d1-dashboard-onboarding` | | 280 tests pass, build green; no live browser check yet |
| D2 | ◐ Code written; **lint, typecheck, tests and build NOT run** (no node_modules/network in the authoring sandbox) | `ui/d2-health-data` | | See handoff in PHASE-D2 file |
| E1 | ◐ Code and tests written; **vitest, lint, `next build` NOT run** (no node_modules/network). Typecheck and a render smoke test were run against stubs (see handoff in PHASE-E1 file) | `ui/e1-assistant` | | |
| E2 | ☐ Not started | `ui/e2-safety-care-sharing` | | |
| F | ◐ **Part 1 (auth, 404) code + tests written; Part 2 (admin) NOT started.** vitest, lint, typecheck and `next build` NOT run (no node_modules/network); syntax-checked only | `ui/f-admin-auth` | | See handoff in PHASE-F file |
| G | ☐ Not started | `ui/g-polish` | | |

## Working rules for every phase

1. One branch and one PR per phase. Merge only when the phase's **exit criteria** pass.
2. Before opening the PR run, from `frontend/`:
   ```
   npm run lint && npm run typecheck && npm test && npm run build
   ```
   Fix failures you introduced. Record pre-existing failures separately in the PR description. Never claim a check passed without running it.
3. Do not touch `backend/`. If a phase seems to need a backend change, stop and log it under **Decisions & open questions** below.
4. Every new user-facing string goes into `lib/i18n/en.ts`, `hi.ts` and `or.ts`. (Hindi/Odia are machine-generated and unreviewed; keep the existing `locale.notice` behaviour.)
5. Reuse before adding: check `components/ui/primitives.tsx` and existing feature components first.
6. Update this tracker and the "Handoff" section of the phase file when you finish.

## Decisions & open questions

Record decisions here so later phases do not re-litigate them.

| # | Decision | Why | Phase |
|---|---|---|---|
| 1 | No new animation dependency by default; use CSS transitions and the existing reduced-motion hooks. Revisit `motion` only if the sliding nav indicator or layout transitions cannot be done cleanly in CSS. | Smaller bundle, fewer React 19 compatibility risks, reduced-motion already handled in CSS. | B |
| 2 | "Settings" is a **new real page** (`/settings`) that consolidates language, display and voice preferences using the existing profile fields. It is not a dead link. | The brief lists Settings in navigation; no route exists today. | C |
| 3 | Caregiver profile switching is **out of scope**: the backend has no caregiver grants (`docs/DATABASE.md` line 470). The UI shows shared-access features that exist (`/share`, `/shared`) and nothing more. | Cannot fabricate permissions. | D1/E2 |
| 4 | "Search" is a **command palette for navigation and actions** (routes, quick actions). It does not search patient data. | No search endpoint exists; do not fake one. | C |
| 5 | AI responses are **not streamed** (API returns whole replies). Show a real loading state; do not simulate typing. | `docs/API.md` has no streaming endpoint. | E1 |
| 6 | Brief palette is kept, with contrast caveats: `#B7791F` amber and `#38BFA7` mint fail AA as text on white. Keep the darkened `--amber-600` (`#8F5D12`) for text; use the brighter values for fills/icons only. | WCAG 2.2 AA. | B |
| 7 | Keep one `/profile` page, nav label "Health Profile". | Avoid scope creep. | A/C |
| 8 | Experience mode in `localStorage` with safe default. | No profile field exists; no backend changes. | A/B |
| 9 | Self-host Inter via the `@fontsource-variable/inter` npm package (not `next/font/google`); no Geist. | `next/font/google` fetches from Google at build time, which fails offline/in CI sandboxes; the package ships the font files. **Only dependency added in Phase B** (OFL licence, CSS import, no runtime request). | B |
| 10 | Bell badge uses the existing `GET /notifications/unread-count` (due-now, unread); the list uses `GET /notifications?limit=20`. No backend change. | Real data only; endpoint already exists. | C |
| 11 | On phones (<640px) the experience menu, voice button and account menu live in the "More" drawer; the top bar keeps logo mark, Search, **Emergency**, Notifications. | 320px width; Emergency must never be hidden. | C |
| 12 | Content width raised from `max-w-5xl` to `max-w-[1440px]` per spec. Existing pages were not re-laid-out; D1/D2/E/F may want inner max-widths. | Spec §5. | C |
| 13 | The dashboard's "Ask the assistant" examples are plain text, not links that pre-fill a question. The assistant page has no deep-link input, and Phase D1 does not change it. | Clicking an example that does not ask it would mislead. E1 may add a `?q=` input and then make them links. | D1 |
| 14 | `ExperienceProvider` now exposes `ready` (false until the saved reading mode has been read on this device). The dashboard waits for it so Easy-read users do not trigger the Standard-only requests for one render. | Avoids wasted calls and a flash of the full layout. | D1 |
| 15 | "Upcoming" shows appointment *requests* only (status text from `STATUS_BADGE`); it is hidden while loading and when nothing is open and in the future. | No confirmed-booking claims; no layout jump. | D1 |
| 16 | `/labs/trend` mixes units for one test name (it takes the unit from the newest result). The Labs screen charts only points whose own result has the same unit (`comparableTrend`) and says how many were left out. Backend fix is a separate task. | Safety invariant: incomparable units are never graphed together. No backend change in this track. | D2 |
| 17 | Medication cards show next dose (from the loaded 2-day dose window) and supply status (from `/medications/alerts` only). Schedule summaries are in the detail drawer, because only a per-medicine schedules endpoint exists. | No N+1 requests; no invented status. | D2 |
| 18 | Out-of-stock alerts are amber (caution); only expired is red. | Red is reserved for serious safety. | D2 |
