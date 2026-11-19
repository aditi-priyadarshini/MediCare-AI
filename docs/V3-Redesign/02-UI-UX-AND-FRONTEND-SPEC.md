# MediCare 360 V3 — UI/UX & Frontend Engineering Specification

## 1. Experience target

**Reference direction:** polished, modern product interfaces commonly showcased on 21st.dev — crisp layouts, strong typography, thoughtful interactions, high-quality tables, command menus, responsive navigation and refined motion.

Do not copy a flashy template wholesale. Healthcare needs calm hierarchy, legibility and predictable behaviour more than visual novelty.

### Visual personality
- Premium, calm, confident, human.
- Warm neutral background, white/soft surfaces, deep teal/forest brand colour.
- A restrained accent for AI; amber for caution; red only for serious danger/emergency.
- Clear typography and consistent spacing.
- Subtle depth, not a pile of floating cards.
- Distinctive dashboard composition without fake KPIs.

## 2. Design system

### Tokens

Treat the current repository tokens and `docs/UI_REDESIGN/00-MASTER-SPEC.md` as the starting point. Validate actual CSS values before changing them.

| Token role | Direction |
|---|---|
| Canvas | warm ivory / neutral |
| Surface | white |
| Primary | deep teal / forest |
| Text | dark navy / near-black |
| Muted text | accessible cool grey |
| Border | low-contrast neutral, still visible |
| AI surface | soft lavender, reserved for assistant features |
| Caution | amber with explicit label/icon |
| Critical | emergency red, reserved |
| Success | muted green only for genuine success states |

Rules:
- No status conveyed by colour alone.
- Maintain WCAG 2.2 AA contrast.
- High-contrast mode overrides all semantic tokens.
- Avoid hard-coded hex and ad-hoc Tailwind colours inside page components.
- Use semantic tokens for every state.

### Typography and spacing
- Use the Inter variable font already present in frontend dependencies if the app currently imports it.
- Use a predictable scale: page title, section title, card title, body, supporting label, metadata.
- Prefer 4/8px spacing rhythm.
- Keep readable line length; avoid tiny uppercase labels for important patient information.
- Numbers, units and dates must be visually grouped and consistently formatted.

### Shape and elevation
- Consistent radius scale: small controls, medium cards, large panels.
- Use borders for structure; shadows only for elevation and overlays.
- Avoid every element becoming a pill.
- Minimum 44px touch target for key mobile interactions.

## 3. 21st.dev component workflow

21st.dev is a **reference and component discovery workflow**, not a requirement to install an entire UI kit.

For every candidate component:
1. Identify the exact screen problem it solves.
2. Review source and dependencies.
3. Rebuild/adapt using existing tokens, TypeScript conventions and `components/ui`.
4. Check keyboard, focus, semantics, touch targets, contrast and reduced motion.
5. Verify mobile behaviour and long/localized content.
6. Add tests for the interaction contract.
7. Record added dependency and bundle impact.

### Components worth researching/adapting
- Sidebar with active indicator and collapsible groups.
- Command palette / global quick actions.
- Notification center with unread state.
- Dashboard metric/summary cards (only real data).
- Data tables with filters, sorting, pagination and responsive card fallback.
- Multi-step onboarding.
- Upload dropzone with progress and review status.
- Timeline for records and events.
- Chat composer, context selector and evidence drawer.
- Settings navigation and preference controls.
- Skeleton and empty-state patterns.
- Mobile bottom navigation and action sheets.

### Avoid
- Unreviewed copied code with hidden dependencies.
- Huge animation bundles for simple transitions.
- Components that depend on inaccessible hover-only actions.
- Charts that hide underlying values or imply clinical conclusions.
- Infinite scroll for critical records without an accessible pagination alternative.

## 4. Page-by-page V3 requirements

### Dashboard
- Personal greeting and clear “Today” focus.
- Medication doses due/overdue based only on backend schedule data.
- Quick actions: add record, add medication, view labs, ask assistant.
- Recent records and lab results.
- Attention panel with source, timestamp and next action.
- New user state with guided setup, not empty dashboard metrics.
- Skeleton loading and independent section error handling.

### Health profile
- Clear sections: personal details, conditions, allergies, emergency contacts, preferences and consent.
- Provenance labels: patient-reported, imported, clinician-confirmed.
- Make editing and saving states explicit.
- Never bury allergies or emergency contacts behind multiple layers.

### Records and labs
- Drag/drop and camera upload where supported.
- Upload progress, validation errors and retry.
- Document type, date, source, review status and file actions.
- Lab trends only for same test and comparable units.
- Always offer a table/list alternative to charts.
- Distinguish “above/below report range” from diagnosis.

### Medicines
- Today schedule first; medicine list second.
- Clear taken / skipped / pending state.
- “Taken” requires explicit user confirmation.
- Dose detail: medicine, dose, route, timing, schedule and supply/refill context where available.
- Do not advise doubling a missed dose.
- Distinguish reminder created, scheduled, sent, delivered and acknowledged where the backend supports it.

### Medicine safety
- Present the exact check type and inputs.
- Show findings, no matching record or insufficient data as distinct outcomes.
- Never display a universal green “safe” state.
- Explain source limitations and when to contact a pharmacist/clinician.
- Keep adverse-event reporting easy to find.

### AI assistant
- Visible context chips/toggles for every data source included.
- Show evidence returned by the API; do not fabricate references.
- Clear answer state, loading, retry and error.
- Distinguish general information from patient-specific interpretation.
- Keep medical disclaimer visible and avoid false certainty.
- Do not simulate streaming if the API returns a complete response.

### Care, sharing and emergency
- Mark demo/synthetic provider data clearly.
- Never imply a booking is confirmed unless the backend confirms it.
- Sharing: scope, recipient, expiry, consent and revoke in plain language.
- Emergency: one-tap emergency number; emergency contacts visible; simulation labels obvious.

### Admin
- Separate admin shell and role-gated routes.
- Destructive actions require confirmation and clear audit.
- Provider configuration must not expose secrets after save.
- Rule/reference data should show status, provenance, version and review owner.
- Add MFA before real patient-data production.

## 5. Interaction and motion

- 120–250ms for routine feedback.
- Use CSS transitions for simple hover/focus/expand states.
- Motion library only if a real interaction requires it and bundle impact is justified.
- Respect `prefers-reduced-motion` and the app preference.
- Never animate emergency content or delay an urgent action.
- Every control needs hover, focus-visible, active, disabled, loading and error states where relevant.
- No dead buttons, decorative controls that look interactive, or hover-only functionality.

## 6. Responsive behaviour

| Width | Expected behaviour |
|---|---|
| 320–374px | single-column layout; no horizontal page overflow; compact labels; bottom navigation |
| 375–639px | phone layout; sheets/drawers for secondary actions |
| 640–767px | compact tablet; flexible single/two-column sections |
| 768–1023px | tablet; sidebar may remain collapsed or switch to drawer |
| 1024–1439px | desktop sidebar and main content |
| 1440px+ | constrained content width; avoid excessively wide forms/tables |

For data tables, define a mobile fallback: card rows, column priority, or deliberate horizontal scrolling within the table region (never the whole page).

## 7. Frontend architecture and code quality

- Keep domain components grouped by feature.
- Separate page composition from data fetching and reusable presentation.
- Use typed API response models; avoid `any`.
- Centralize API calls in `lib/` domain clients.
- Avoid duplicate fetches across dashboard widgets; consider a single aggregate endpoint only if measured and justified.
- Use pagination for large lists.
- Use `AbortController` or request lifecycle guards for stale requests.
- Avoid optimistic updates for high-risk medical actions unless rollback and reconciliation are robust.
- Keep forms schema-driven only where it improves consistency; do not over-engineer.
- Split oversized components when responsibilities or state become hard to reason about.
- Use server components for static and server-readable content where appropriate; keep client boundaries small.
- Add error boundaries and consistent error states.
- Do not put PHI in URL query strings, analytics events, console logs or error telemetry.

## 8. Frontend performance budgets

Set measurable budgets during Phase 0, then enforce them:
- Track route-level JS and shared JS against the current repository baseline.
- No unexplained increase in shared JS.
- Lazy-load heavy charts, camera/scan tools and admin-only panels.
- Use image optimization and correct sizing.
- Avoid unnecessary re-renders in timelines, lists and chat.
- Debounce user-driven search; cancel stale requests.
- Use skeletons only when loading is real; no fake content.
- Measure LCP, INP and CLS on representative desktop and mobile devices.
- Test with throttled network and low-end Android hardware.

## 9. Accessibility and localization

Target WCAG 2.2 AA:
- Keyboard-operable navigation and dialogs.
- Visible focus and logical focus order.
- Correct headings/landmarks/labels.
- Accessible names for icon-only controls.
- 44px minimum key touch targets.
- Large text without clipped content.
- High contrast and reduced motion.
- Screen-reader announcements for save/error/upload/dose actions.
- Charts have data-table alternatives.
- Hindi and Odia translations reviewed by native speakers; machine-generated translations must not be treated as final.
- Dates, times, units and numbers formatted consistently.

## 10. Testing gates

For each route:
- component tests for meaningful interactions;
- API contract tests for request/response behaviour;
- axe checks;
- Playwright end-to-end tests for core journeys;
- visual screenshots at mobile/tablet/desktop breakpoints;
- manual keyboard and screen-reader review;
- reduced-motion and high-contrast checks.

Core end-to-end journeys:
1. Register → verify → onboard → dashboard.
2. Add condition/allergy → reload → verify persistence.
3. Upload record → review extracted data → confirm/correct.
4. Add medicine → create schedule → mark dose taken.
5. Add lab result → verify trend comparability.
6. Ask AI with selected context → inspect evidence and limitations.
7. Share selected records → access as recipient → revoke.
8. Trigger emergency action → verify one-tap call path and simulation disclosure.
9. Admin updates reference/rule data → audit event appears.

## 11. Frontend acceptance checklist

- [ ] All existing routes inventoried and tested.
- [ ] No existing feature removed without product approval.
- [ ] Existing API contracts preserved or versioned.
- [ ] Design tokens replace scattered one-off styles.
- [ ] All controls have accessible states.
- [ ] 320px viewport has no page-level horizontal overflow.
- [ ] Large text, contrast, reduced motion and locale preferences work.
- [ ] Empty/error/loading states are truthful.
- [ ] No fabricated medical data or fake AI evidence.
- [ ] Lint, typecheck, unit tests, E2E tests and production build pass.
- [ ] Bundle and web-vitals changes are documented.
