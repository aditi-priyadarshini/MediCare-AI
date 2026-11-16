# Phase D2 — Health Data Screens

**Goal:** Profile, Records, Labs and Medications become clear, scannable, mobile-friendly workflows with all current actions intact.
**Depends on:** C. **Size:** L. **Branch:** `ui/d2-health-data`.
Do these four as separate commits so each can be reviewed alone.

## Shared rules
- Preserve every existing action (create, edit, delete/"remove as entered in error", upload, download, confirm, take/skip/reset dose, add supply, etc.).
- Dense data → table on desktop, stacked cards on mobile. Tabular numerals for values, dates, doses.
- Verification state always visible (`VerificationBadge` / `SourceBadge`).
- Every list: skeleton, empty state with next action, error state with retry.
- Confirm destructive or sensitive actions with `ConfirmationDialog`; success feedback via `Toast`.
- Records and results are never hard-deleted by the user (`entered_in_error`); wording must reflect that.

## 1. Profile (`/profile`, `components/health/*`)
- [ ] Sectioned layout with a sticky section nav on desktop (Personal, Body & blood group, Conditions, Allergies, Emergency contacts, Preferences) and an accordion/stepper on mobile.
- [ ] Per-section save with visible saved/error state; keep `blood_group_verification_status` read-only and displayed.
- [ ] Completeness indicator reuses `profile.completeness`.
- [ ] Decide (from Phase A) whether account details and health profile share one page; either way nav labels must match page titles.

## 2. Medical Records (`/records`, `RecordsSection.tsx`)
- [ ] Upload dropzone: accepted types and 10 MB limit stated up front (server validates by magic bytes), progress, clear error messages; keyboard-operable file picker.
- [ ] List with filters by type and date, search within loaded items, status badges.
- [ ] Detail drawer: metadata, verification status, download (writes an audit entry — keep the existing endpoint), edit (note: editing resets verification to patient reported — say so before saving), remove as entered in error.
- [ ] Do not preview files client-side unless the existing API already supports it.

## 3. Lab Results (`/labs`, `LabsSection.tsx`, `TrendChart.tsx`)
- [ ] `LabResultCard` / table row: test name, value, unit, report range, date, source, flag as **"below / above report range"**, never "abnormal".
- [ ] Test selector → trend chart only for comparable results (same test and unit, via `/labs/trend`). If one point: "No comparable history yet."
- [ ] Chart accessibility: text summary, focusable points or data-table toggle, no colour-only meaning, no clinical green/red.
- [ ] Group by test; table view always available.
- [ ] Add/edit result form as a simple step-by-step flow in Easy-read mode.

## 4. Medications (`/medications`, `components/medications/*`)
- [ ] Tabs: Active · Paused · Completed. `MedicationCard` (mobile) / table (desktop) showing name, strength, form, prescribed vs self-reported, schedule summary, next dose, supply status.
- [ ] Today's doses as a timeline: Taken / Skip / Undo (reset) using existing endpoints; "overdue" derived by server; no auto-taken, no "double the dose" language.
- [ ] Alerts card (refill, expiring, out of stock) with text + icon; keep notification read actions.
- [ ] Details: prescribed instructions shown separately from user notes; schedules, supplies/batch/expiry.
- [ ] Add medicine flow: catalogue search or manual entry, source choice (prescribed / self-reported), schedule setup with time zone. Split `MedicationDetails.tsx` (339 lines) into smaller parts.

## Tests
Update or extend `records.test.tsx` and `medications.test.ts`; add tests for lab flag wording, chart text alternative, upload validation messaging, dose action endpoints, edit-resets-verification notice. Existing tests green.

## Exit criteria
- Every previous action still works (manual pass checklist in PR description).
- No "abnormal", "safe" or health-score wording introduced.
- Mobile 320px no overflow on all four screens.
- Lint, typecheck, test, build pass.

## Handoff
Components added, endpoints touched, any behaviour deliberately left unchanged.

## Paste-ready prompt
```
Read docs/UI_REDESIGN/README.md, 00-MASTER-SPEC.md and do Phase D2 from
docs/UI_REDESIGN/PHASE-D2-health-data.md. Redesign Profile, Records, Labs and Medications
in four separate commits, preserving every existing API call and action. Follow the safety
invariants in the master spec (lab flag wording, verification badges, no auto-taken doses).
Extend existing tests. Run lint, typecheck, test and build and report real output.
```
