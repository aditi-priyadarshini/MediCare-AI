# Phase C — Application Shell

**Goal:** a premium navigation frame for desktop and mobile that every page drops into.
**Depends on:** B. **Size:** M. **Branch:** `ui/c-app-shell`.

## Scope
Rewrite `frontend/components/layout/AppShell.tsx` into smaller parts; touch `app/(app)/layout.tsx` only to compose providers (do **not** change the `OnboardingGate` logic or auth/profile loading). New route `app/(app)/settings/page.tsx`.

## Tasks
### Desktop
- [ ] `Sidebar`: 248px expanded / 76px collapsed, animated width (≤200ms), collapse state persisted (try/catch `localStorage`), tooltips on collapsed icons, grouped nav per master spec §5, animated active indicator, `aria-current="page"`, admin group visible only when `user.role === "admin"`.
- [ ] Preserve: skip link, `nav.privateNote` privacy note, translated labels (`nav.*` keys; add new keys to en/hi/or). Admin and Feedback labels stay English-only unless translated here.
- [ ] `Topbar`: breadcrumbs, `SearchCommand` trigger, **Emergency button (always visible, deliberate, not animated)**, `NotificationPanel` bell with unread count, `ExperienceMenu`, `VoiceCommandBar`, `UserMenu` (name, Settings, Sign out).
- [ ] `Breadcrumbs`: derived from route config; hidden on top-level pages where redundant.
- [ ] Content container: `max-w-[1440px]`, responsive padding, `min-w-0` to prevent overflow.

### Mobile
- [ ] `MobileNavigation`: bottom bar with **4–5 primary items** (Home, Medications, Ask AI, Records, More). "More" opens a drawer with the full grouped nav, Settings, Feedback, Sign out. No horizontally scrolling bar.
- [ ] Sticky Emergency access that cannot be activated by accident (visible control opening `/emergency`; the call confirmation stays on that page).
- [ ] 44px targets, safe-area padding (`env(safe-area-inset-bottom)`), drawer with focus trap and Escape to close.

### Shared pieces
- [ ] `NotificationPanel`: real data from `GET /notifications`, mark read (`POST /notifications/{id}/read`), mark all read; empty, loading, error states. Reuse the data hook from `components/medications/AlertsCard.tsx`; keep AlertsCard working.
- [ ] `SearchCommand` (⌘/Ctrl+K and button): navigation and quick actions only (routes + "Upload report", "Add medication", "Ask AI", "Check medicine safety"). Decision #4: no data search.
- [ ] `ExperienceMenu`: Standard / Easy-read, large text, high contrast, reduced motion, voice. Extends/replaces `DisplayToggles` but saves through the same `save({ ...toInput(profile), accessibility_preferences })` path with failure feedback.
- [ ] Page transitions: ≤200ms fade/translate on route change; disabled under reduced motion; never delays content or emergency UI.
- [ ] `/settings` page: language selector (existing `preferred_language`), display & accessibility preferences, voice toggle, link to Profile and Feedback. Uses real saved fields only.
- [ ] Locale notice (`locale.notice`) keeps showing for non-English.

## Constraints
- Only real routes in navigation; no dead links (Settings now exists).
- Do not alter auth, onboarding gate, or profile-loading behaviour.
- Emergency button must not be inside a collapsed menu on any breakpoint.

## Tests
Navigation renders every link with the right `href`; admin group hidden for patients; keyboard: open/close drawer, command palette open/close/arrow/enter; collapse persists; notification read/unread flow with mocked API; axe on shell; mobile bar has ≤5 items; existing tests green.

## Exit criteria
- All existing pages render inside the new shell with no overflow at 320px.
- Keyboard-only user can reach every nav item, the palette, notifications, user menu and Emergency.
- Reduced motion removes shell animations.
- Lint, typecheck, test, build pass.

## Handoff (completed)
**Route config:** `lib/nav.ts` is the single source for sidebar, mobile bar/drawer, breadcrumbs and palette. To add a page: add a row to `NAV_ROUTES` `{ href, icon, label: {key}|{text}, group, shortLabel?, mobilePrimary?, adminOnly?, keywords? }` (plus i18n keys in en/hi/or). Nested admin pages go in `ADMIN_PAGES` (also drives `AdminNav` tabs and breadcrumbs). Palette shortcuts go in `QUICK_ACTIONS` (navigation only). `tests/shell.test.tsx` fails if an href has no `app/(app)/<route>/page.tsx`.
**New components:** `components/layout/{Sidebar,Topbar,Breadcrumbs,MobileNavigation,NotificationPanel,SearchCommand,ExperienceMenu,UserMenu}`; `components/ui/{Drawer,Popover}` (Dialog now exports `useModalBehaviour`); `components/settings/PreferenceControls` (`ExperienceChoice`, `PreferenceSwitches`). `DisplayToggles` removed (replaced by `ExperienceMenu`).
**Hooks:** `lib/preferences.ts` `usePreferences()` (saves via `save({...toInput(profile), ...})`, reports failure); `lib/notifications.ts` `useNotifications()`.
**Settings:** new `/settings` page (language, reading mode, large text, contrast, reduced motion, voice, links to Profile/Feedback).
**Behaviour:** sidebar collapse stored in `localStorage` key `medicare.sidebar` (try/catch); Ctrl/Cmd+K palette; `viewport-fit=cover` added so safe-area insets work; route fade uses `--motion-base` so reduced motion removes it.
**Fixed along the way:** sidebar and mobile bar both had landmark name "Main" (axe `landmark-unique`); mobile bar is now "Quick links".
**Not done / next:** no live browser check (320px overflow, tooltip position, safe-area, real screen reader); pages are not restyled (D/E/F); `AlertsCard`/`RemindersCard` still have their own notification fetch; Feedback/Admin labels stay English; Hindi/Odia strings are machine-generated and unreviewed; the palette shortcuts open pages, they do not deep-link (e.g. "Upload a report" opens Records).
**Results:** lint clean (0 warnings), typecheck clean, 20 files / 217 tests pass (25 new in `tests/shell.test.tsx`), `next build` passes (`/settings` added).

## Paste-ready prompt
```
Read docs/UI_REDESIGN/README.md, 00-MASTER-SPEC.md and do Phase C from
docs/UI_REDESIGN/PHASE-C-app-shell.md using the Phase B components. Do not change
auth, the OnboardingGate or API contracts. Create a single route-config module used by
sidebar, mobile nav, breadcrumbs and the command palette. Build a real /settings page.
Add translations for en/hi/or. Run lint, typecheck, test and build and report real output.
```
