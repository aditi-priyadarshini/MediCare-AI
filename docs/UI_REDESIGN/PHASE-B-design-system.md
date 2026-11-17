# Phase B — Design System Foundation

**Goal:** one source of truth for tokens, type, motion and primitives, plus the preferences system, so every later page looks consistent without per-page styling.
**Depends on:** A. **Size:** M. **Branch:** `ui/b-design-system`.

## Scope
`frontend/app/globals.css`, `frontend/tailwind.config.ts`, `frontend/app/layout.tsx`, `frontend/components/ui/*`, `frontend/lib/` (preferences, toast), tests.

## Tasks
### Tokens
- [ ] Extend CSS variables in `globals.css` and map them in `tailwind.config.ts`: canvas `#FAF9F6`, `lavender-100 #EEEAFE`, `coral-500 #F28B82`, amber text/fill split, spacing, radius (`sm/card/lg/pill`), 3 elevation levels, motion durations and easings, z-index scale.
- [ ] Type scale per master spec §4; tabular-numerals utility (e.g. `.tnum`) for medical values.
- [ ] High-contrast overrides for **every** new token (extend the existing `html[data-contrast="high"]` block).
- [ ] Reduced-motion: keep existing `data-reduce-motion` and media query; add a `--motion-*` variable approach so components never hard-code durations.
- [ ] Contrast check for each text/background pair actually used; document the table in `docs/DESIGN.md` (update its palette table).

### Primitives (extend `components/ui/`, split `primitives.tsx` into files if it helps, keep the same import path working via re-exports)
- [ ] `Button`: variants (primary, secondary, ghost, danger), sizes, loading, disabled, pressed feedback, 44px minimum.
- [ ] `StatusBadge` (tone + icon + text, never colour-only), `SourceBadge` (patient reported / imported / clinician confirmed — reuse `VerificationBadge` logic).
- [ ] `PageHeader` (title, description, actions, breadcrumb slot).
- [ ] `ErrorState` (retry action), richer `EmptyState` (icon, explanation, primary action), `Skeleton` variants (text, card, table row).
- [ ] `ConfirmationDialog` (focus trap, Escape, return focus, `role="alertdialog"` for destructive), plus a generic `Dialog`/`Drawer`.
- [ ] `Toast` + `ToastProvider` (`role="status"`/`alert`, auto-dismiss except errors, pause on hover/focus).
- [ ] `AccessibleFormField` over `FieldShell` (label, hint, error with `aria-describedby`, optional marker).
- [ ] `StepProgress` (ordered list, `aria-current="step"`, text not just dots).
- [ ] `Tabs`, `Dropdown/Menu` (keyboard arrow navigation, typeahead optional).
- [ ] Easy-read hooks: components read `data-experience` to enlarge controls and simplify density via CSS, not per-component props.

### Preferences system
- [ ] `lib/experience.ts` + provider: modes Standard / Easy-read; sets `data-experience` on `<html>`. Persist per the Phase A decision (profile field if one exists, else `localStorage` with try/catch and a safe default).
- [ ] Do not change how `large_text`, `high_contrast`, `reduce_motion`, `voice_enabled` are saved (`profile-context.tsx`).

### Fonts
- [ ] Inter via `next/font` (self-hosted) in `app/layout.tsx`; no runtime Google Fonts request. Latin only is fine; Hindi/Odia fall back to system fonts as today.

## Constraints
- No new dependency (decision #1). If a headless-dialog/menu library seems necessary, log the reason first.
- Existing imports from `@/components/ui/primitives` must keep compiling so other pages keep working until their phase.
- Do not restyle pages in this phase beyond what tokens change automatically.

## Tests
Unit/axe tests for each new primitive: renders, keyboard operation, focus return, `aria-*`, no axe violations, reduced-motion respected. Existing tests unchanged and green.

## Exit criteria
- Tokens documented in `docs/DESIGN.md`.
- All primitives exist with default/hover/focus/active/disabled/loading/error/success states where applicable.
- Experience mode toggles `data-experience` and works with the four existing toggles.
- Lint, typecheck, test, build pass.
- Visual smoke check: existing pages still render acceptably with new tokens (no unreadable text, high-contrast still works).

## Handoff (completed)
**Import:** `@/components/ui` (index) exports everything; `@/components/ui/primitives` still works unchanged.
**New components** (all in `components/ui/`): `StatusBadge{tone,icon}`, `SourceBadge{source}`, `PageHeader{title,description,actions,breadcrumb}`, `ErrorState{title,onRetry}`, `StepProgress{steps,current}`, `Dialog{open,onClose,title,role}`, `ConfirmationDialog{open,title,destructive,onConfirm,onCancel}`, `ToastProvider` + `useToast().show(msg,tone)`, `Tabs{items,label}`, `Menu{label,items}`, `AccessibleFormField` (= `FieldShell`).
**Extended:** `Button` gains `size` and pressed state; `EmptyState` gains `icon`/`action`; `Skeleton` gains `variant`.
**Experience mode:** `lib/experience.tsx`, stored in `localStorage` key `medicare.experience`, applied as `data-experience` on `<html>`; falls back to Standard if storage is blocked. `ExperienceProvider` and `ToastProvider` are mounted in `app/layout.tsx`.
**Also fixed:** `/` now redirects (dashboard if signed in, else login) instead of rendering the admin overview.
**Contrast:** all text pairs pass AA; `#B7791F`, `#38BFA7`, `#F28B82` fail as text and are fill-only (table in `docs/DESIGN.md`).
**Not done / next:** no menu-based `ExperienceMenu` UI yet (Phase C); only existing pages were not restyled; no live browser check of high-contrast or Easy-read; Hindi/Odia pages unchanged.
**Results:** lint clean, typecheck clean, 19 files / 192 tests pass (15 new), `next build` passes.

## Paste-ready prompt
```
Read docs/UI_REDESIGN/README.md, 00-MASTER-SPEC.md, AUDIT.md and do Phase B from
docs/UI_REDESIGN/PHASE-B-design-system.md. Work only in frontend/. Add no dependencies.
Keep existing imports from components/ui/primitives working. Write tests for every new
primitive. Finish by running lint, typecheck, test and build and reporting real output.
```
