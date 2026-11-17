# Design System & UX Specification

> **Redesign in progress:** the colour, shell and accessibility changes planned for the next UI iteration (warm ivory canvas, lavender AI surfaces, Easy-read mode, grouped navigation, `/settings`) are specified in [`UI_REDESIGN/00-MASTER-SPEC.md`](UI_REDESIGN/00-MASTER-SPEC.md). Phase B updates this file's token tables when they are implemented; until then this file describes what is currently built.

**Product:** MediCare AI  
**Design direction:** Premium clinical SaaS, calm and trustworthy  
**Reference inspiration:** 21st.dev component patterns and modern shadcn-compatible React interfaces. Use the patterns as inspiration; do not copy a component without checking its source, licence and dependencies.

## 1. Brand identity

**Name:** MediCare AI  
**Tagline:** Your health, connected.  
**Personality:** Calm, clear, credible, supportive, accessible.  
**Avoid:** Neon cyber aesthetics, excessive gradients, glassmorphism everywhere, cartoon medical illustrations, giant hero text inside working dashboards, overuse of red, decorative charts without meaning.

## 2. Colour palette

Primary palette: **Clinical Teal / Deep Navy / Soft Mint**.

| Token | Hex | Usage |
|---|---|---|
| `brand-900` | `#123B43` | Primary brand, deep sidebar |
| `navy-900` | `#172C3D` | Headings, dark navigation |
| `teal-700` | `#157873` | Primary actions and links (darkened from `#167C78` in Phase 6 so teal text on `mint-100` passes WCAG AA) |
| `teal-500` | `#38BFA7` | Positive accent, charts |
| `mint-100` | `#E9F5F2` | Soft highlighted surfaces |
| `canvas` | `#F5F7FA` | Main application background |
| `surface` | `#FFFFFF` | Cards and panels |
| `border` | `#E3E9ED` | Dividers and card borders |
| `text-primary` | `#172B36` | Main text |
| `text-secondary` | `#667783` | Secondary text |
| `amber-600` | `#B7791F` | Caution and expiry warnings |
| `amber-100` | `#FFF4D9` | Caution background |
| `red-700` | `#B42332` | Serious alerts |
| `red-100` | `#FDEBEC` | Serious alert background |
| `blue-700` | `#2563A6` | Informational status |
| `blue-100` | `#EAF2FC` | Informational background |
| `success-700` | `#18794E` | Confirmed positive state |
| `success-100` | `#E8F5EE` | Success background |

### Colour rules
- Teal is the main action colour.
- Mint is supportive, not a substitute for a status label.
- Amber means caution, not emergency.
- Red is reserved for serious safety/emergency states.
- Never communicate status using colour alone; include text and an icon.
- Check contrast for text and controls. Do not assume palette combinations automatically pass WCAG.

## 3. Typography

Recommended:
- UI: Inter or Geist Sans.
- Numeric data: tabular numerals.
- Medical report values: clear labels, units and dates.
- Headings: medium/semibold, not oversized.
- Body: 14–16px desktop baseline; 16px preferred for older-adult mode.
- Avoid long all-caps labels and very light font weights.

## 4. Layout system

Desktop:
- Left sidebar: 248px expanded, 76px collapsed.
- Top bar: 64–72px.
- Content max width: 1440px.
- Main content padding: 24–32px.
- Grid: 12 columns, 16–24px gaps.
- Cards: 12–16px radius, subtle border, minimal shadow.
- Tables for dense data; cards for summaries and a small number of key actions.

Tablet:
- Collapsible sidebar or navigation drawer.
- Two-column cards where space permits.
- Keep tables horizontally manageable or switch to stacked rows.

Mobile:
- Compact top bar and bottom navigation for key patient actions.
- One-column layout.
- Full-width primary actions.
- Minimum 44px target size.
- Sticky SOS entry point, but avoid accidental activation.
- Forms use clear labels and short steps.

## 5. Patient application shell

### Desktop
- Dark teal/navy vertical sidebar.
- Brand at top.
- Grouped navigation: Overview, Health, Care, Account.
- Main canvas in `#F5F7FA`.
- Top bar with page title, search, notification centre and profile menu.
- Main content starts with page title and concise context.

### Patient dashboard
Recommended order:
1. Greeting and profile completeness.
2. Today's medication card with next dose and taken/missed counts.
3. Health overview: latest selected observations, not a generic "health score".
4. Trend panel for a selected test such as HbA1c, if comparable values exist.
5. Safety alerts requiring attention.
6. Upcoming reminders/refills.
7. Recent reports and documents.
8. Quick actions: Add medicine, Upload report, Ask AI, Find care.
9. Emergency action in a consistently discoverable but deliberate location.

Avoid an invented composite health score. Do not label a patient "healthy" based on incomplete records.

## 6. Key screen specifications

### Login / sign up
- Clean centered form, brand mark, short reassurance copy.
- Continue with Google.
- Email and password.
- OTP verification as a distinct step.
- Password visibility toggle.
- Clear validation and resend cooldown.
- No dark patterns or unnecessary onboarding fields.

### Onboarding
Use a progressive multi-step flow:
1. Basic profile.
2. Language and accessibility.
3. Conditions and allergies (optional, clearly labelled).
4. Current medicines (optional).
5. Emergency contact (optional).
6. Consent and privacy explanation.

Allow skip for non-essential data. Do not make sensitive details mandatory for a basic account.

### My Health
- Summary of profile, conditions, allergies and vitals.
- Source and verification badges: Patient reported, Clinician confirmed, Imported, Needs review.
- Timeline of significant health events.
- Clear edit history.

### Medical Records
- Filter by document type and date.
- Upload dropzone with accepted formats and size.
- Preview original document.
- OCR extraction panel with field-by-field confirmation.
- Statuses: Uploaded, Processing, Needs confirmation, Confirmed, Failed.

### Lab results
- Show test name, value, unit, reference range, date and source.
- Chart only comparable results.
- Table view always available.
- Display "No comparable history yet" instead of fabricating a trend.
- Do not use green/red as a clinical diagnosis; use out-of-range labels based on the supplied reference range.

### Medicines
- Active, paused, completed tabs.
- Medicine list as table on desktop, cards on mobile.
- Detail page includes prescribed instructions, schedule, prescriber/source, batch and expiry where known.
- Clearly distinguish prescribed instructions from user notes.

### Reminder tracker
- Timeline/day view.
- Actions: Taken, Skip, Snooze/Delayed, Unable to confirm.
- Do not auto-mark taken.
- Missed dose message should not advise doubling a dose; direct user to the prescription or qualified professional.

### Safety checker
- Input selected medicines and patient context with consent.
- Result grouped by severity.
- Each result contains explanation, source, reviewed date and uncertainty.
- Empty result says "No matching record found in this dataset" rather than "No interactions".

### AI assistant
- Familiar chat layout with suggested prompts.
- Context chips: Current medicines, Recent lab results, Medical history (on/off).
- Visible "Using your records" indicator and a way to inspect included records.
- Citations/source cards for retrieved facts.
- Separate observed data from AI explanation.
- No fake typing animation that delays urgent content.
- High-risk prompts trigger safe, concise escalation.

### Pharmacy and doctor discovery
- Map/list toggle.
- Filters and result cards.
- Show source and last-updated time for availability.
- "Call to confirm" if no inventory feed.
- Doctor credentials have verification status.
- Reviews are not clinical-quality guarantees.

### Emergency
- High-contrast page with local emergency contact information.
- Clear call action.
- Location sharing consent.
- Minimal emergency summary preview.
- Demo ambulance workflow visibly marked "Simulation — no real ambulance is dispatched".
- Do not use a decorative fake live map.

## 7. Component inventory

Use reusable components:
- `AppShell`, `Sidebar`, `MobileNav`, `Topbar`
- `PageHeader`, `SectionHeader`, `Breadcrumbs`
- `MetricCard`, `StatusBadge`, `SourceBadge`
- `MedicationCard`, `DoseTimeline`, `AdherenceSummary`
- `LabResultRow`, `TrendChart`, `DataTable`
- `DocumentUploader`, `OCRReviewPanel`
- `SafetyAlert`, `InteractionResult`
- `ChatPanel`, `ContextSelector`, `CitationCard`
- `MapListToggle`, `ProviderCard`
- `ConsentDialog`, `ShareAccessDialog`
- `EmergencyActionPanel`
- `EmptyState`, `LoadingSkeleton`, `ErrorState`, `ConfirmDialog`

## 8. Interaction and motion

- Use subtle hover, focus and pressed states.
- Motion duration typically 120–200ms.
- Respect `prefers-reduced-motion`.
- Use skeletons for loading; never fake data.
- Confirm destructive or sensitive actions.
- Autosave only where safe and visibly confirmed.
- Toasts for non-critical success/failure; inline errors for form fields.
- Avoid animations on emergency and serious safety alerts.

## 9. Accessibility requirements

- WCAG 2.2 AA target.
- Keyboard-only navigation.
- Visible focus ring.
- Semantic headings and form labels.
- Screen-reader status announcements.
- Text alternatives for charts and maps.
- Font scaling without layout breakage.
- High contrast mode.
- Reduced motion.
- Voice is optional, not the only route to an action.
- Confirm medicine names, strengths and timings visually and audibly when voice is used.

## 10. 21st.dev inspiration and implementation guidance

Use 21st.dev to explore:
- Dashboard shells and sidebars
- Sign-in and sign-up patterns
- Data tables and charts
- AI chat layouts
- Alerts and status badges
- Forms, dialogs and multi-step onboarding
- Maps and search controls

Prefer restrained, accessible patterns. Avoid animated shader backgrounds and marketing-style effects inside clinical workflows. Before installing a component, inspect its code, dependencies, accessibility, licence and responsive behaviour. Adapt it to the tokens above rather than letting every imported component introduce a different visual language.

Reference: https://21st.dev/community/components


## Phase B tokens and contrast (UI redesign)

Source of truth for tokens is `frontend/app/globals.css` (CSS variables) mapped in `tailwind.config.ts`.
New: `canvas #FAF9F6`, `lavender-100/700` (AI surfaces only), `coral-500` (fills only), `amber-fill #B7791F` (fills only),
radius `sm/card/lg`, shadows `1/2/3`, motion `--motion-fast/base/slow` (zeroed by reduced motion), z-index scale,
type utilities `text-display/h1/h2/h3`, `.tnum`. Easy-read: `html[data-experience="easy"]` sets `--control-min: 52px`.
High-contrast mode overrides every status, lavender and shadow token.

Measured WCAG contrast (text pairs actually used):

| Pair | Ratio | Result |
|---|---|---|
| ink on canvas | 13.90 | AA |
| ink-soft on canvas / white | 5.50 / 5.79 | AA |
| teal-700 on white / mint-100 | 5.29 / 4.74 | AA |
| white on teal-700 / brand-900 / danger-700 | 5.29 / 12.12 / 6.51 | AA |
| amber-600 on amber-100 | 5.13 | AA |
| danger-700 on danger-100 | 5.66 | AA |
| info-700 on info-100 | 5.45 | AA |
| success-700 on success-100 | 4.82 | AA |
| lavender-700 on lavender-100 | 6.99 | AA |
| amber-fill `#B7791F` as text on white | 3.64 | **Fails: fill/icon only** |
| teal-500 `#38BFA7` as text on white | 2.29 | **Fails: fill/icon only** |
| coral-500 `#F28B82` as text on white | 2.39 | **Fails: fill/icon only** |
