# Phase E1 — AI Health Assistant

**Goal:** a premium, honest conversational interface that makes it obvious what the assistant can see and how it got its answer.
**Depends on:** C. **Size:** M. **Branch:** `ui/e1-assistant`.

## Scope
`frontend/app/(app)/assistant/page.tsx`, `components/assistant/{AssistantView,ContextControls,EvidenceList}.tsx`, `lib/assistant.ts`, `components/voice/*`.

## Facts to respect
- Sessions: `POST /assistant/sessions` with `context: {medicines, history, labs, doses, allergies}`; all switches default to **off**; turning any on requires the `ai_context` consent or the API returns 403 `AI_CONTEXT_CONSENT_REQUIRED`; `PATCH /assistant/sessions/{id}/context` merges switches; `GET /assistant/status` returns model mode (`llm` / `evidence_only`), consent state and notices.
- There is **no streaming**. Show a real "thinking" state; do not fake typing (decision #5).
- Replies are validated server-side for citations and no-diagnosis; if the provider fails, the assistant falls back to listing matching records. The UI must show which mode answered.

## Tasks
- [ ] Layout: conversation column + collapsible context side panel on desktop; context as a bottom sheet on mobile. Lavender is used for assistant surfaces only.
- [ ] `ContextSelector`: toggles for each context type with plain-language descriptions, current on/off state always visible as chips above the composer ("Using: Medicines, Labs"), disabled with explanation and a path to grant consent when `ai_context` consent is missing.
- [ ] "What the AI can see" inspector listing exactly the context kinds currently on. Never claim records were read when none were supplied.
- [ ] Suggested prompts (static, generic, not derived from fake data); clicking fills the composer.
- [ ] Message list: user vs assistant styles, timestamps, `role="log"` with polite live region, auto-scroll that respects user scroll position.
- [ ] Evidence/source cards (`EvidenceList`): render only what the API returns (record/date/source/verification), each linking to the underlying record page where a route exists. No invented citations.
- [ ] Answer mode badge: "Written with AI from your records" vs "Matching records only (AI unavailable)" based on the API response.
- [ ] Message actions: copy, read aloud (`ReadAloudButton`), feedback thumbs **only if** an endpoint exists (check `docs/API.md`; if none, omit and log it — do not add a button that does nothing).
- [ ] Voice input (`VoiceInputButton`) with visible state and confirmation before sending; voice never sends silently.
- [ ] Persistent, visible notice: explanations are not a substitute for professional medical advice; emergencies → `/emergency` / 112. Not hidden in a tooltip.
- [ ] Session list/new chat, empty state with onboarding hint, error state with retry, loading skeleton.
- [ ] Keyboard: Enter to send, Shift+Enter newline, focus returns to composer after send; Easy-read mode simplifies the panel (one toggle group, larger text).

## Tests
Extend `assistant.test.tsx`: all switches default off; consent-required error surfaces a clear message; context chips match state; evidence cards render only API-provided data; mode badge for `evidence_only`; copy and read-aloud; disclaimer always present; no streaming/typing simulation; axe clean.

## Exit criteria
- Cannot send a patient-context question with a context switch shown on that the API did not accept.
- Disclaimer visible without interaction on every viewport.
- Lint, typecheck, test, build pass.

## Handoff (written, NOT fully verified)
**Verification status.** Run: `tsc --strict` over `lib/assistant.ts`, every assistant component and the page, against **stubbed** React/lucide/next typings (so invalid i18n keys, wrong imports and prop mismatches are caught, but real React/DOM types were not used); a server-render smoke test of the components with real React (60+ assertions, all pass); syntax check of the test file. **Not run:** `npm run lint`, `vitest` (the new tests in `tests/assistant.test.tsx` are unexecuted, expect to fix selector or timing details), `next build`, any browser or axe pass, any manual screen-reader pass. Run all four npm checks before merging.
**What changed.** Layout: chats column (desktop, drawer on phones), conversation, collapsible context panel (xl) or bottom sheet (below xl). `ContextControls` (switches, consent-disabled state with link to `/profile#privacy`, locked while anything is in flight), `ContextInspector` ("What the AI can see"), `ContextChips` ("Using: ..." above the composer, built only from the context the server returned), `AnswerModeBadge` (lavender only when a model wrote the text; "from your records" only if the API returned patient-record evidence), `MessageList` (`role="log"`, sticky scroll that respects reader position, "New message below" button, plain "Working on your answer..." state, no streaming or typing animation, timestamps in the profile time zone, copy, read-aloud when voice is on, urgent answers get Call 112 + emergency page), `Composer` (Enter sends, Shift+Enter newline, IME-safe, focus returns after an answer, static generic suggested prompts that fill but never send, voice stays review-then-send), `SessionList`, confirmation dialog for delete (replaces `window.confirm`). Citation markers become buttons only when the API returned that evidence reference, and open and focus the evidence row. Evidence rows link to the Labs / Medicines / Records / My Health page only when the API gave a record id. Safety notice is always on the page, never in a tooltip. Easy-read: larger text, one switch group, two prompts.
**i18n.** 99 new `assistant.*` keys in en/hi/or (hi/or machine-generated, unreviewed, as before). `MODE_NOTE`, `SOURCE_LABEL`, `CONTEXT_OPTIONS.key` are still exported.
**Blocked by the API (omitted on purpose).** Per-answer thumbs feedback: no endpoint (platform `/feedback` is not per message). Streaming: none. Per-record deep links: no record routes, so links go to list pages. Easy-read persisted per account: device-only (decision 8).
**Not done.** Retrieval over uploaded file text; session rename; Hindi/Odia review by a native speaker.

## Paste-ready prompt
```
Read docs/UI_REDESIGN/README.md, 00-MASTER-SPEC.md and do Phase E1 from
docs/UI_REDESIGN/PHASE-E1-assistant.md. Redesign the assistant UI. Do not simulate
streaming, do not invent citations, do not add buttons for endpoints that do not exist.
Show exactly which context switches are on and the answer mode. Keep the safety notice
always visible. Extend assistant tests, then run lint, typecheck, test and build.
```
