# Phase G — Polish, Validation & Final Report

**Goal:** prove the redesign meets the quality gate, fix what is left, and report honestly.
**Depends on:** all previous phases. **Size:** M. **Branch:** `ui/g-polish`.

## Tasks
### Coverage
- [ ] Walk every route in the Phase A inventory (including `/admin/*`, `/emergency`, `/shared`, `/`, 404). Tick each in `docs/UI_REDESIGN/QA-CHECKLIST.md` (create it).
- [ ] Grep for dead links/buttons: every `href` resolves to a real route; every button has a handler; no leftover `COMING`/placeholder UI.
- [ ] Grep for forbidden wording in UI strings: "abnormal", "all clear", health "score", "safe" in safety contexts.

### Responsive
- [ ] Check 320, 375, 768, 1024, 1280, 1920 widths on every route: no horizontal overflow, targets ≥44px, sticky bars do not cover content.
- [ ] Text scaling: Large text mode and browser zoom 200% without clipped or overlapping content (also in Hindi/Odia).

### Accessibility
- [ ] axe over every route in tests and in a real browser (including colour contrast) for Standard, Easy-read, Large text and High contrast.
- [ ] Keyboard-only run of: sign-in, onboarding, add medication, take a dose, upload a record, ask AI, create a share, open Emergency.
- [ ] Focus order, visible focus, landmarks, headings, live regions, chart text alternatives.
- [ ] Reduced motion: verify both OS setting and in-app toggle remove all non-essential motion; emergency UI never animates.
- [ ] State clearly in the report whether a manual screen-reader pass was done (the project has none so far; see `../KNOWN_LIMITATIONS.md`).

### Quality
- [ ] Loading, empty, error states exist on every data screen.
- [ ] Bundle review: compare `next build` route sizes with the Phase A baseline; flag large regressions.
- [ ] i18n: every new key exists in en/hi/or; no raw keys visible; language switch works on all redesigned pages.
- [ ] Remove unused components, tokens and old styles.

### Docs
- [ ] Update `docs/DESIGN.md` (tokens, components, layout), `docs/KNOWN_LIMITATIONS.md`, `docs/TESTING.md`, root `README.md` UI section, and `docs/DEMO.md` walkthrough if screens changed.

### Final commands (from `frontend/`) — run and paste the real output
```
npm run lint
npm run typecheck
npm test
npm run build
```
Report pre-existing failures (from Phase A) separately from any new ones.

## Exit criteria
Master spec §10 quality gate fully satisfied, or each exception listed with reason in the report.

## Final report (required format)
1. What changed 2. Routes redesigned 3. New reusable components 4. Dependencies added/removed 5. Accessibility improvements 6. Tests and build results 7. Remaining limitations (e.g. no manual screen-reader pass, machine-translated Hindi/Odia, no caregiver switching, no streaming, no data search).

## Paste-ready prompt
```
Read docs/UI_REDESIGN/README.md, 00-MASTER-SPEC.md, AUDIT.md and do Phase G from
docs/UI_REDESIGN/PHASE-G-polish-validation.md. Verify every route, fix issues found,
and produce QA-CHECKLIST.md and the final report. Run lint, typecheck, test and build and
paste actual results; do not claim a check passed unless you ran it.
```
