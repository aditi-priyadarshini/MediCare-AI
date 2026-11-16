# Phase F — Admin Console & Authentication Screens

**Goal:** bring admin and the signed-out experience up to the same quality bar.
**Depends on:** B (auth screens), C (admin uses the shell). **Size:** M. **Branch:** `ui/f-admin-auth`.

## Part 1 — Authentication (`app/(auth)/*`, `components/auth/*`)
Routes: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`.
- [ ] Split-screen layout on desktop (brand/trust panel + form), single column on mobile. Trust copy must be factual: private by default, not a medical device. No claims about certifications.
- [ ] Login: email/password, `PasswordField` with visibility toggle, Continue with Google (existing `GoogleButton`), clear errors announced in a live region.
- [ ] Register: password requirements shown as you type (use `lib/validation.ts`), note that the account email may already exist (existing 409 behaviour stays).
- [ ] Verify email: distinct OTP step, resend with visible cooldown, expiry explained.
- [ ] Forgot/Reset: same neutral wording as today (do not reveal whether an account exists).
- [ ] Preserve the redirect logic in `(auth)/layout.tsx` and `(app)/layout.tsx` (anonymous → `/login`, unverified → `/verify-email`).
- [ ] 44px targets, autofill-friendly `autocomplete` attributes, no horizontal overflow at 320px.
- [ ] `not-found.tsx`: friendly 404 with a link home/dashboard. Confirm what `/` renders (Phase A) and make it a sensible entry (redirect or a brief public intro with Sign in / Register — no marketing hero inside the product).

## Part 2 — Admin (`app/(app)/admin/*`, `components/admin/*`)
Sub-pages: overview, accounts, ai, audit, feedback, reference, rules. English only today.
- [ ] Admin section navigation (`AdminNav`) as tabs/side list consistent with the new shell; visible only to administrators; server remains the real boundary (403 for patients).
- [ ] Overview: counts from the existing endpoint as `MetricCard`s with labels, no invented trends.
- [ ] Accounts: searchable table, deactivate/reactivate with `ConfirmationDialog` (cannot deactivate self).
- [ ] Safety rules: list, version history, supersede (never edit in place), retire, second-person review; keep the "awaiting second-person review" and synthetic-data notices.
- [ ] Reference data/sources, AI providers (Test button, health counters per instance), feedback moderation queue, audit log with filters and date range.
- [ ] Dense tables: sticky header, horizontal scroll contained inside the table wrapper, keyboard-focusable rows, mobile stacked layout.
- [ ] Never show patients' health data in admin views; audit view keeps showing only `admin.*`, `auth.*`, `feedback.*` events.

## Tests
Extend `login-form.test.tsx`, `admin-ui.test.tsx`, `admin-lib.test.ts`; add tests for OTP cooldown display, neutral reset wording, admin nav hidden for patients, confirmation required for deactivate/retire, axe on each auth page.

## Exit criteria
- Full sign-up → verify → login → onboarding → dashboard path works.
- All admin actions still work; destructive ones confirm.
- Lint, typecheck, test, build pass.

## Paste-ready prompt
```
Read docs/UI_REDESIGN/README.md, 00-MASTER-SPEC.md and do Phase F from
docs/UI_REDESIGN/PHASE-F-admin-auth.md. Redesign the auth screens, 404, root page and
every admin sub-page. Keep redirect logic, neutral reset wording, rule versioning
(never edit in place) and the server-side admin boundary. Extend tests, then run lint,
typecheck, test and build and report real output.
```
