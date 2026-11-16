# Phase E2 — Safety, Diet, Care, Sharing, Feedback, Emergency, Shared

**Goal:** the remaining patient-facing screens adopt the new system while keeping their stricter safety wording.
**Depends on:** C. **Size:** L. **Branch:** `ui/e2-safety-care-sharing`. One commit per screen.

## 1. Safety Checker (`/safety`, `components/safety/*`)
- [ ] Step-based flow: choose medicines → (optional) include conditions/allergies from profile → run check → results.
- [ ] Results grouped by severity, each with explanation, source, version, jurisdiction, review date, and conflict flag (two rules disagreeing are both shown). Severity = icon + text + colour.
- [ ] Outcomes are only `findings`, `no_matching_record`, `insufficient_data`. **Never** green/"safe"/"clear"/"success". Empty = "No matching record in this dataset… not the same as being cleared."
- [ ] Keep the synthetic-dataset notice visible. Keep alternatives labelled "candidate", price freshness (`stale` after 90 days), authenticity card showing explicit unsupported state, ADR report form.

## 2. Diet & Wellness (`/diet`, `components/diet/*`)
- [ ] Preferences and plans as clear cards; keep the "educational, not medical advice" limitation visible; no calorie/target claims beyond what the API returns.

## 3. Find Care (`/care`, `components/care/*`)
- [ ] Tabs: Pharmacies · Doctors · My appointment requests. Map/list toggle only if a map already exists; otherwise list with filters (do not add a decorative map).
- [ ] Show `source`, `freshness` (fresh/stale label) and `notice` on every result; stock is `no_feed` or `reported` — show "Call to confirm" when no feed; doctor credential = verified/unverified badge.
- [ ] Appointment flow is a **request** (`request_only` clinics: saved, not sent). Wording must say so. Handle `PROVIDER_UNAVAILABLE`, `ALREADY_REQUESTED`, `APPOINTMENT_LIMIT`, `NOT_CANCELLABLE` with clear messages. Location (`lat/lon`) is used per request only; ask permission first and say so.

## 4. Care & Sharing (`/share`, `components/sharing/*`)
- [ ] Create-share flow as steps: choose what to share (with `/shares/preview`) → recipient and expiry (1–720 h) → confirm → link shown **once** with copy button and warning it cannot be shown again.
- [ ] Active shares list with expiry, status, access log, Revoke (confirmation dialog). Respect the 20 active-share limit message.
- [ ] No caregiver profile switching (decision #3): the backend has no grants.

## 5. Feedback (`/feedback`)
- [ ] Simple form (5–2000 chars, category, 10/hour limit message), status list in plain words, reminder not to include health details and to call 112 in emergencies. English only unless translated.

## 6. Emergency (`/emergency`, `EmergencyPanel.tsx` 471 lines) — highest care
- [ ] High-contrast, uncluttered. The `tel:112` call action is the largest control, always first, no animation, no delay.
- [ ] Location sharing behind explicit consent; minimum-necessary summary preview before any send.
- [ ] Ambulance flow stays prominently labelled **"Simulation — no real ambulance is dispatched"**. No fake live map.
- [ ] Split the component into smaller parts without changing behaviour. Existing `emergency-ui.test.tsx` must pass unchanged in its assertions.

## 7. Shared summary viewer (`/shared`, `SharedClient.tsx`, `SharedSummaryView.tsx`)
- [ ] Public, no app shell, no navigation to private pages. Recipient code verification step → summary view with clear "shared by / expires" header and print-friendly layout. Handle expired/revoked/invalid states without revealing details.

## Tests
Extend `safety.test.tsx`, `care-ui.test.tsx`, `share-ui.test.tsx`, `emergency-ui.test.tsx`, `diet.test.ts`: forbidden words ("safe", "all clear") absent from safety results; stale/no_feed labels; request wording; link-shown-once behaviour; simulation label present; `/shared` exposes no shell; axe clean.

## Exit criteria
- All existing actions work; every error code above has a human-readable message.
- Safety wording invariants verified by tests.
- Lint, typecheck, test, build pass.

## Paste-ready prompt
```
Read docs/UI_REDESIGN/README.md, 00-MASTER-SPEC.md and do Phase E2 from
docs/UI_REDESIGN/PHASE-E2-safety-care-sharing.md. Redesign safety, diet, care, share,
feedback, emergency and the public /shared viewer, one commit each, preserving all API
calls. Never use "safe"/"clear" in safety results, keep the ambulance simulation label,
say appointment "requests", show the share link once. Extend the existing tests, then run
lint, typecheck, test and build and report real output.
```
