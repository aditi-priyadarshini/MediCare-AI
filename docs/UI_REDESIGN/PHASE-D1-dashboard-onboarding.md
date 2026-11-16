# Phase D1 — Dashboard & Onboarding

**Goal:** an intelligent, personal dashboard built only from real data, and a gentle multi-step onboarding.
**Depends on:** C. **Size:** L. **Branch:** `ui/d1-dashboard-onboarding`.

## Scope
`frontend/app/(app)/dashboard/page.tsx`, `frontend/app/(app)/onboarding/page.tsx`, new `components/dashboard/*`, `components/onboarding/*`.

## Part 1 — Dashboard

Current state: six `limit=1` count calls rendered as count cards, a `COMING` placeholder list, and a four-item profile checklist. Replace with a composed layout; **no health score, no invented insights, no fake appointments**.

### Layout (desktop 12-col grid, most important gets most space)
1. **Header row:** greeting by first name, one contextual line derived from real data (e.g. "2 doses due today" only if doses exist; otherwise a neutral line), `ProfileCompletion` ring/bar with a "finish profile" link listing the missing items, quick actions.
2. **Today (largest tile):** today's doses from `/doses` with Taken / Skip actions that call the existing endpoints (`POST /doses/{id}/take|skip`). Never auto-mark taken. If none scheduled: empty state with "Add medication".
3. **Needs attention:** medication alerts from `GET /medications/alerts` (refill, expiring, out of stock) and unread notifications. Status = icon + text. Serious items not colour-only. Empty = "Nothing needs attention", not a celebration.
4. **Recent activity / `HealthTimeline`:** merged, date-sorted list of the latest records (`/records`), lab results (`/labs`) and dose events actually returned. Interactive (expand details), keyboard accessible.
5. **Lab highlights:** latest results with value, unit, report range, date, and "below/above report range" label (not "abnormal"). Link to `/labs`. Mini trend only if ≥2 comparable results exist (`/labs/trend`); include table alternative.
6. **Upcoming:** appointment **requests** from `/appointments` (label them "requests", not confirmed bookings). Hide the tile if the endpoint returns none.
7. **AI panel (lavender surface):** suggested questions that open `/assistant`, plus a plain statement of what the assistant can use: only the context switches the user turns on per chat, governed by the `ai_context` consent. Do not claim it has read anything. Show the consent state from `GET /assistant/status` if available.
8. **Quick actions:** Upload report (`/records`), Add medication (`/medications`), View labs (`/labs`), Ask AI (`/assistant`), Manage profile (`/profile`), Find care (`/care`).
9. Emergency stays in the topbar (Phase C); do not duplicate it as a decorative tile.

### Engineering
- [ ] Parallel fetches with per-widget loading skeletons and per-widget `ErrorState` (one failing call must not blank the page).
- [ ] Use existing `useAsync` / `api` client; no new data layer.
- [ ] Responsive: tiles reflow to one column; no horizontal overflow at 320px.
- [ ] Easy-read mode: fewer tiles (Today, Needs attention, Quick actions, Ask AI), larger text and buttons.
- [ ] Remove the `COMING` placeholder.

## Part 2 — Onboarding

Current flow (`onboarding/page.tsx`, 5 steps): basic profile → preferences (language/accessibility) → step 3 and 4 optional (conditions/allergies, then medicines/contacts — confirm in audit) → consent. Required consents are `terms`, `privacy`, `health`; optional `ai_context`; saved with `PUT /consents/{type}`; finishing calls `reload()` and the gate redirects to `/dashboard`.

- [ ] Keep every existing API call, validation rule and the required-consent rule; keep the `OnboardingGate` behaviour untouched.
- [ ] Add a welcome step (what MediCare AI does and does not do; no medical-advice claims; privacy reassurance). Purely informational, no API.
- [ ] `StepProgress` with step names; animated step transitions (≤200ms, off under reduced motion); direction-aware.
- [ ] Each step explains **why** the data is asked and states if it is optional; optional steps have a visible Skip.
- [ ] Accessibility preferences step shows live preview of large text / contrast / Easy-read, and saves through the existing profile fields.
- [ ] Inline validation (reuse `lib/validation.ts`), errors focus the first invalid field.
- [ ] Mobile-first, one question group per screen, sticky bottom action bar with safe-area padding.
- [ ] Progress is kept in component state on back/forward; do not lose typed data when navigating steps.

## Tests
Dashboard: each widget renders loading/empty/error/data states with mocked API; no "score" text anywhere; dose actions call the right endpoints; failing alerts call does not hide other tiles; axe clean. Onboarding: cannot finish without required consents; optional steps skippable; step navigation preserves data; errors announced.

## Exit criteria
- Dashboard shows only real data; every number traces to an API response.
- Onboarding completes end-to-end against the existing API with the gate redirecting to `/dashboard`.
- Easy-read and reduced-motion variants verified.
- Lint, typecheck, test, build pass.

## Handoff
List which endpoints the dashboard uses and any widget hidden because the API lacks data.

## Paste-ready prompt
```
Read docs/UI_REDESIGN/README.md, 00-MASTER-SPEC.md and do Phase D1 from
docs/UI_REDESIGN/PHASE-D1-dashboard-onboarding.md. Redesign the dashboard and onboarding
using the shell and primitives from Phases B and C. Use only real API data: never invent
scores, insights or appointments. Preserve all existing API calls, consent rules and the
OnboardingGate. Write tests, then run lint, typecheck, test and build and report real output.
```
