# Master Spec — MediCare AI UI/UX Redesign

Source of truth for the redesign. Phase files reference this; they do not repeat it.
Supersedes the visual sections of `../DESIGN.md` where they differ (see "Changes vs DESIGN.md").

## 1. Goal

Redesign MediCare AI as a premium, calm, trustworthy healthcare product that a 16-year-old and an 80-year-old can both use, and that can be demonstrated to hospitals, doctors and investors. This is a **whole-product** redesign, not a landing-page refresh. Users should never wonder what to do next.

Audiences: children/teens, young adults, working professionals, parents/caregivers, older adults, people with chronic conditions, doctors and administrators.

Feel: premium modern SaaS + personal health companion + credible medical information + intelligent assistant.

## 2. Hard constraints

**Stack (existing, keep):** Next.js 15.5, React 19, TypeScript, Tailwind 3.4, `lucide-react`, Vitest + Testing Library + axe. Current runtime dependencies are only `next`, `react`, `react-dom`, `lucide-react`.

**Do not:** replace the backend, rewrite auth, break API contracts, remove routes or features, hardcode fake medical data, put keys in frontend code, replace real API calls with stubs, break localization (en/hi/or), or break the existing accessibility preferences.

**Preserve:** `lib/auth-context.tsx`, `lib/profile-context.tsx` (it applies `data-large-text`, `data-contrast`, `data-reduce-motion` to `<html>`), the `OnboardingGate` in `app/(app)/layout.tsx`, `lib/api-client.ts`, `lib/i18n/*`, voice components, admin features, and all 19 existing test files in `frontend/tests/`.

**Dependencies:** add none unless a phase documents why the existing stack cannot do it (bundle impact, React 19 support, licence). Record it in the README decision log.

## 3. Safety invariants (release-blocking — design must never violate these)

These come from `../PRD.md`, `../SECURITY.md` and the Phase 2–9 notes in the root `README.md`. Visual redesign must not change their meaning.

1. **Never say "safe".** Safety checks return `findings`, `no_matching_record` or `insufficient_data`. No green "all clear" styling or wording. Empty result = "No matching record in this dataset."
2. **Lab flags** are "below / above report range", never "abnormal", never green = healthy / red = sick. Only comparable results (same test, unit) are charted; table view always available.
3. **No fabricated data**: no health score, no invented insights, appointments, stock, trends or citations. Empty states say what is missing.
4. **Doses** are only `taken` by an explicit user action. UI never implies automatic confirmation. Missed-dose copy never advises doubling.
5. **AI**: show which context switches are on (medicines, history, labs, doses, allergies); never claim access to records that were not supplied; show evidence/citations only as returned by the API; always show the "not a substitute for professional advice" notice.
6. **OCR / imported values** show verification status (patient reported, needs review, confirmed) via `VerificationBadge`.
7. **Emergency**: `tel:112` stays one tap away; the ambulance flow stays visibly labelled as a simulation; no decorative fake live map; no animation delays emergency content.
8. **Status is never colour-only**: always text + icon. Red is reserved for serious safety/emergency; amber = caution.
9. Demo/synthetic data stays labelled as synthetic.

## 4. Visual identity

### Palette
| Token | Hex | Use |
|---|---|---|
| `brand-900` Deep Forest | `#123B43` | Sidebar, brand |
| `navy-900` Dark Navy | `#172C3D` | Headings |
| `teal-700` Emerald Teal | `#157873` | Primary actions, links |
| `teal-500` Fresh Mint | `#38BFA7` | Accent, charts, fills (not text on white) |
| `mint-100` Soft Mint | `#E9F5F2` | Highlight surfaces |
| `canvas` Warm Ivory | `#FAF9F6` | App background (was `#F5F7FA`) |
| `surface` | `#FFFFFF` | Cards |
| `lavender-100` Soft Lavender | `#EEEAFE` | **AI-related surfaces only** |
| `coral-500` Warm Coral | `#F28B82` | Gentle accent, illustration touches (not text) |
| `amber-600` | `#8F5D12` text / `#B7791F` fill | Caution |
| `danger-700` Emergency Red | `#B42332` | Critical safety only |

Existing `info`, `success` and `border` tokens stay. High-contrast mode must override every new token.

Colour discipline: most surfaces are white or ivory. Colour carries meaning (primary action, AI, caution, emergency); it is not decoration. Do not turn every card into a coloured card.

### Typography
Inter (already first in the font stack; add Geist only if self-hosted without a runtime network call). Scale: display 28/32, h1 24/30, h2 20/26, h3 17/24, body 16/24 (15 allowed in dense tables), small 14/20, caption 12/16 (never for essential info). Tabular numerals (`font-variant-numeric: tabular-nums`) for every medical value, date and dose. No light weights.

### Tokens to define (Phase B)
Colour, type scale, spacing (4px base), radius (`sm 8, card 14, lg 20, pill`), elevation (3 levels, subtle), borders, motion durations (`fast 120ms`, `base 180ms`, `slow 250ms`) and easings, z-index layers, and component states (default, hover, focus, active, disabled, loading, error, success).

## 5. Navigation (only real routes)

```
OVERVIEW   Dashboard /dashboard
MY HEALTH  Health Profile /profile · Medical Records /records · Lab Results /labs
           Medications /medications · Diet & Wellness /diet
CARE       AI Health Assistant /assistant · Care & Sharing /care + /share (two items, one group)
           Safety Checker /safety · Find Care /care
ACCOUNT    Feedback /feedback · Settings /settings (new, Phase C)
ADMIN      Admin /admin (administrators only)
```
Notes: `/care` is "Find care" (pharmacies, doctors, appointment requests); `/share` is "Care & Sharing" (share links). Do not point two items at the same URL — name them distinctly. "Profile" (account/personal details) and "Health Profile" currently share `/profile`; the audit (Phase A) decides whether to split the page or keep one item. `/emergency` stays a persistent, distinct button in the topbar and mobile bar, not buried in a menu.

## 6. Adaptive experience (accessibility preferences)

Existing saved fields: `large_text`, `high_contrast`, `reduce_motion`, `voice_enabled`, plus `preferred_language`. Build on these; do not invent a parallel store.

Add an **Experience mode** layer on top (client-side, applied as `data-experience` on `<html>`; persisted only if an existing profile field can hold it, otherwise device-local — decide in Phase B and log it):
- **Standard** — default.
- **Easy-read** — simpler labels, one primary action per card, fewer simultaneous choices, larger controls, step-by-step forms.
- Large text / High contrast / Reduced motion / Voice — existing toggles, surfaced in Settings and the quick menu.

Never infer age or ability. Let people choose; make the choice discoverable from the topbar and Settings.

## 7. Motion rules
120–250ms for interface feedback. Every animation must serve a purpose (orientation, feedback, continuity). Respect `prefers-reduced-motion` and the in-app reduce-motion preference (both already handled in `globals.css`). No animation on emergency or serious safety alerts. Never delay emergency information. Skeletons for loading — never fake data.

## 8. Accessibility target
WCAG 2.2 AA: keyboard operable, visible focus, semantic landmarks, labelled forms, 44px minimum targets, text scaling without breakage, no horizontal overflow at 320px, accessible chart alternatives (data table), clear error messages. Automated axe checks are not a manual screen-reader pass; the final report must say which was done.

## 9. Component inventory
Already present (`components/ui/primitives.tsx`): `Button`, `FieldShell`, `TextField`, `PasswordField`, `SelectField`, `CheckboxField`, `Card`, `Alert`, `VerificationBadge`, `Skeleton`, `PageLoading`, `EmptyState`. Extend these rather than duplicating.

New (introduced in the phase shown):
- **B:** `StatusBadge`, `SourceBadge`, `ErrorState`, `ConfirmationDialog`, `Toast`/`ToastProvider`, `AccessibleFormField` (wraps `FieldShell`), `StepProgress`, `PageHeader`, `Tabs`
- **C:** `AppShell` (rewrite), `Sidebar`, `MobileNavigation`, `Topbar`, `Breadcrumbs`, `SearchCommand`, `NotificationPanel`, `UserMenu`, `ExperienceMenu`
- **D1:** `DashboardWidget`, `MetricCard`, `HealthTimeline`, `ProfileCompletion`
- **D2:** `MedicationCard`, `LabResultCard`
- **E1:** `AIChatPanel`, `ContextSelector`, source/evidence cards

Every component supports: default, hover, focus-visible, active, disabled, loading, error, success where applicable.

## 10. Quality gate (Phase G confirms)
Every route reviewed; every action still works; no dead links or buttons; no horizontal overflow on mobile; no fabricated data; preferences and reduced motion work; `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all executed and reported honestly.

## 11. Final report format
1. What changed 2. Routes redesigned 3. New components 4. Dependencies added/removed 5. Accessibility improvements 6. Test/build results (with pre-existing failures separated) 7. Remaining limitations.

## Changes vs `../DESIGN.md`
- Canvas colour moves from `#F5F7FA` to warm ivory `#FAF9F6`; lavender and coral tokens added.
- Sidebar groups renamed per §5; Settings page added.
- Sidebar 248px expanded / 76px collapsed (unchanged); content max width stays 1440px.
- Easy-read experience mode added to the accessibility requirements.
