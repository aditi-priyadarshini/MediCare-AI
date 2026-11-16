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
| A | ☐ Not started | `ui/a-audit` | | |
| B | ☐ Not started | `ui/b-design-system` | | |
| C | ☐ Not started | `ui/c-app-shell` | | |
| D1 | ☐ Not started | `ui/d1-dashboard-onboarding` | | |
| D2 | ☐ Not started | `ui/d2-health-data` | | |
| E1 | ☐ Not started | `ui/e1-assistant` | | |
| E2 | ☐ Not started | `ui/e2-safety-care-sharing` | | |
| F | ☐ Not started | `ui/f-admin-auth` | | |
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
