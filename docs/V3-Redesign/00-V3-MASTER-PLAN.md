# MediCare 360 — V3 Master Product & Engineering Plan

**Document set:** V3 planning pack  
**Prepared:** 19 November 2026  
**Basis:** `MediCare-AI-main(2).zip` repository inspection  
**Status:** Planning specification — not an implementation or a claim that every existing feature works in production.

## 1. V3 direction

MediCare 360 should feel like a premium, calm, modern healthcare companion: fast, clear, accessible, trustworthy and useful on both desktop and phone. The target is not a generic admin dashboard with medical labels. It is a patient-first product with a coherent experience across records, medicines, lab results, AI explanations, care discovery, safety and emergency access.

**Product promise:** Help people understand and organize their health information, follow their medication routines, and share relevant information with trusted care providers — without pretending to replace clinicians or emergency services.

### V3 principles

1. **Patient-first, action-oriented:** every screen answers “What can I do here?” and presents the next useful action.
2. **Trust over decoration:** no fabricated health scores, diagnoses, trends, appointments, availability, inventory or citations.
3. **One product, two clients:** web and Android share terminology, workflows, API contracts and design tokens.
4. **Progressive disclosure:** show essential information first; advanced details and forms open when needed.
5. **Accessible by default:** keyboard, screen-reader, large text, contrast, reduced motion, touch targets and localization are core requirements.
6. **Performance is a feature:** fast first render, efficient API calls, small client bundles, paginated lists and resilient offline states.
7. **Security is part of UX:** consent, ownership, verification, sharing expiry and revoke actions must be understandable.

## 2. Current repository baseline

The uploaded repository contains:
- **Web:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Lucide icons, Vitest/Testing Library/axe tooling.
- **Backend:** FastAPI modules for identity, patients, records, medication, safety, assistant, discovery, nutrition, sharing, emergency, feedback, admin and reminder calls.
- **Mobile:** Expo / React Native Android app, currently organized around Home, Medicines, Ask AI, Records and More tabs.
- **Existing UI redesign work:** `docs/UI_REDESIGN/` contains an earlier multi-phase redesign plan and partial handoff/status notes. V3 should reconcile that work rather than blindly restart it.

The current repository is a meaningful feature-rich baseline. V3 should be an **audit-led evolution**, not a rewrite.

## 3. V3 product pillars

| Pillar | What users should achieve | Existing implementation evidence |
|---|---|---|
| Personal health profile | Maintain conditions, allergies, emergency contacts, preferences and consent | Patient profile, conditions, allergies, contacts and consent API routes |
| Health records | Upload, organize, view and correct health documents | Records CRUD, private file routes, scan/OCR route |
| Lab intelligence | Track test results and compare like-for-like values over time | Labs, tests and trend API routes; web lab views/charts |
| Medication companion | Manage prescriptions, schedules, doses, supplies and alerts | Medication, schedule, dose, supply and notification routes |
| Medicine safety | Review drug interactions, condition/allergy/food checks, warnings, alternatives and authenticity reports | Safety API routes and web safety screens |
| AI health assistant | Ask questions with explicit patient-context controls and evidence | Assistant sessions, context patching, message and evidence routes |
| Care discovery | Find doctors/pharmacies and manage appointment records | Discovery search and appointment routes |
| Sharing | Share selected records with time-bounded access and revoke it | Share preview/create/list/access/revoke routes |
| Nutrition | Save preferences and create/view diet plans | Nutrition preferences and plans routes |
| Emergency | Keep emergency contacts and emergency actions accessible | Emergency settings/summary/simulation/dispatch-request routes; UI documents simulation limitations |
| Reminder calling | Ring a registered Android device for medication reminders | Device and WebRTC call routes; experimental integration caveats |
| Administration | Manage accounts, feedback, reference data, AI providers, rules and audit information | Admin routes and admin pages |

## 4. V3 experience model

### Patient web navigation

**Overview**
- Dashboard
- Health profile

**My health**
- Records
- Lab results
- Medicines
- Medicine safety
- Nutrition

**Care**
- Find care
- Shared access
- Emergency

**Support**
- AI assistant
- Notifications
- Feedback
- Settings

Admin navigation remains a separate role-gated workspace. Do not expose admin destinations to patient users.

### Dashboard structure

1. Greeting and date, with no invented health score.
2. “Today” panel: due doses and upcoming items only when returned by the API.
3. Primary actions: add record, log a dose, view labs, ask AI.
4. Recent records and recent lab results.
5. Medication schedule summary.
6. Attention items with explicit source and severity.
7. Optional educational content only when sourced and clearly labelled.

### Visual direction

- Calm warm-neutral canvas; clean white surfaces; deep teal/forest as brand anchor.
- Strong typography hierarchy; generous whitespace; restrained shadows and borders.
- Distinct but subtle visual language for AI, caution and emergency.
- Avoid glassmorphism everywhere, neon gradients, excessive pills, excessive rounded cards and decorative charts.
- Use real patient data or honest empty states. Never use fake dashboard metrics to make the product look populated.

## 5. Frontend technology direction

Keep the existing stack unless an evidence-based reason supports a change:
- Next.js App Router / React / TypeScript
- Tailwind CSS and existing CSS variables/tokens
- Lucide icons
- Existing primitives and component patterns
- Vitest, Testing Library and axe tooling

### Component sourcing and skills

Use **21st.dev as a component discovery and visual-reference source**, not as a blanket dependency or a reason to paste components without review. Evaluate selected patterns for:
- keyboard and screen-reader behaviour;
- responsive behaviour at 320px and up;
- React 19 / Next compatibility;
- bundle size and client-side JavaScript;
- loading, empty, error and disabled states;
- colour contrast and reduced-motion support;
- license and source provenance.

Preferred approach:
1. Inspect 21st.dev examples for modern patterns (sidebar, command menu, dashboard cards, data tables, onboarding, charts).
2. Rebuild/adapt the chosen pattern using the repository's design tokens and primitives.
3. Use shadcn/ui-compatible composition where it helps, but do not add a component framework wholesale.
4. Add Radix primitives only where accessible complex interaction is required and the current components cannot provide it safely.
5. Consider Motion only for purposeful transitions; CSS is preferred for simple interactions.
6. Keep visual dependencies minimal. No animation that delays medical or emergency content.

## 6. Quality and safety invariants

- Patient data is private by default; enforce authorization in the backend, not just the UI.
- AI must show which patient-context sources are enabled and must not claim to have reviewed unavailable data.
- Missing interaction data is not proof of safety.
- OCR/imported data stays unverified until a person confirms it.
- Doses become “taken” only after explicit user action.
- Lab results are described relative to the report's reference range, not as diagnoses.
- Synthetic catalogue/demo data must be labelled.
- Emergency UI must preserve one-tap access to local emergency services; simulation must be visibly labelled.
- No fake provider availability, pharmacy stock or ambulance live status.
- No patient information in analytics, logs, crash reports or client-side error payloads unless explicitly justified and protected.

## 7. V3 definition of done

A feature is not complete because its screen exists. It is complete when:
- its backend contract and authorization are verified;
- loading, empty, error, success and offline states are handled;
- actions persist and reload correctly;
- keyboard, screen-reader and touch interactions work;
- responsive layouts work at 320 / 375 / 768 / 1024 / 1440 widths;
- English, Hindi and Odia strings are accounted for;
- tests cover the happy path and important failure paths;
- performance impact is measured;
- clinical/safety copy is reviewed;
- web/mobile parity is documented where applicable.

## 8. Document map

- `01-EXISTING-FEATURE-AUDIT.md` — what is in the uploaded codebase, gaps and verification status.
- `02-UI-UX-AND-FRONTEND-SPEC.md` — design system, 21st.dev workflow, page patterns and frontend engineering.
- `03-MOBILE-APP-V3-ROADMAP.md` — Android experience, architecture, offline/push/reminders and parity.
- `04-IMPLEMENTATION-ROADMAP.md` — phases, dependencies, acceptance criteria and release gates.

## 9. Important scope boundary

This is a planning pack derived from static repository inspection. It does not establish that external services, Firebase, push delivery, WebRTC calls, maps, OCR, email, live AI providers or production deployment are working. Those require environment-aware integration tests and real-device/service validation.
