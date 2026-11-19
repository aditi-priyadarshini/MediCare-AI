# MediCare 360 V3 — Android Mobile App Enhancement Plan

## 1. Current mobile baseline

The repository contains an Expo / React Native Android app. It currently has:
- Five primary tabs: Home, Medicines, Ask AI, Records, More.
- Screens for Home, Medicines, Assistant/Chat, Records/Lab detail, Profile, Safety, Care, Emergency, Share, Notifications and Settings.
- A lightweight custom navigator with tab stacks and Android hardware-back handling.
- API/session handling in `mobile/src/api.ts`.
- Theme and preferences contexts.
- Incoming-call handling and call screens.
- Dependencies for Expo, React Native, Notifee, Firebase app/messaging, speech, WebRTC, safe-area context and in-call manager.

This is a useful baseline, but static code presence does not prove push delivery, background execution, call reliability or app-store readiness.

## 2. V3 mobile product goals

1. Make the phone experience feel native, fast and touch-friendly.
2. Make medication routines the strongest daily-use workflow.
3. Make records easy to capture with camera or file picker.
4. Make AI useful on mobile without hiding context and evidence.
5. Provide reliable, user-controlled reminders.
6. Keep emergency access visible and fast.
7. Work gracefully on weak networks and low-memory Android devices.
8. Keep patient data private on-device and during API communication.

## 3. Navigation proposal

Retain five tabs unless usage evidence shows a better model:

| Tab | Primary purpose | Main actions |
|---|---|---|
| Home | Today's overview | Due doses, next action, recent health activity |
| Medicines | Medication routine | Schedule, taken/skip, details, supply |
| Ask AI | Health questions | Context controls, chat, evidence |
| Records | Documents and labs | Scan/upload, browse, lab trends |
| More | Secondary tools | Profile, safety, care, share, notifications, emergency, settings |

Improvements:
- Use a proper icon set rather than text glyphs.
- Add selected-state semantics and accessible labels.
- Ensure safe-area padding and Android navigation-bar behaviour.
- Keep bottom tabs stable; use a sheet or nested list for secondary destinations.
- Preserve hardware back behaviour and add deep-link routing carefully.
- Emergency shortcut should remain discoverable without taking over every screen.

## 4. Mobile design language

- Reuse the web design tokens and semantic colours.
- Build native React Native components; do not embed the web UI in a WebView as a shortcut.
- Use native-feeling sheets, pickers, keyboard handling and permission prompts.
- Minimum 44–48dp touch targets.
- Support font scaling and screen readers.
- Avoid dense desktop-style tables; use stacked cards and concise summaries.
- Use subtle haptics only where meaningful and optional.
- Respect system reduce-motion settings where possible.

## 5. Feature enhancements

### Home
- “Today” dose schedule with clear time and status.
- One-tap log dose action with confirmation/undo policy.
- Upcoming appointment/record reminders only if backed by real API data.
- Recent records and labs.
- Useful first-run checklist, no fake health score.

### Medicines
- Search/add medicine flow with validation.
- Daily/weekly schedule views.
- Explicit taken/skipped action.
- Missed-dose information must not tell users to double a dose.
- Supply/refill status where data exists.
- Clear timezone and daylight-saving behaviour.
- Notification preferences per medicine where backend supports them.

### Records
- Camera capture, gallery/file import and upload progress.
- Image/PDF preview.
- Document type/date/source selection.
- OCR output shown as unverified; user confirms or edits before it becomes structured health data.
- Retry and resume for interrupted uploads where technically feasible.
- Avoid storing sensitive files in public app cache; define secure cache and deletion rules.

### Labs
- Result cards with test, value, unit, date and report reference range.
- Charts only for comparable units and tests.
- Table/list alternative.
- Clear “above/below report range” wording, not diagnosis.

### Ask AI
- Context controls visible before sending.
- Show which records/labs/medicines are included.
- Evidence and source details accessible without leaving the conversation.
- Clear warning for urgent symptoms; do not present AI as emergency triage.
- Handle network timeout, retry and partial failure.
- Avoid persisting sensitive prompts in local logs.

### Notifications and reminders
- Separate reminder scheduling from actual delivery state.
- Show permission status and explain why notifications are requested.
- In-app notification inbox with read/unread state.
- Local notification fallback only where it does not conflict with server schedule truth.
- Push token registration, refresh and invalid-token cleanup.
- Respect quiet hours and user-selected channels.
- Do not promise a reminder will arrive if OS settings or battery restrictions can block it.

### Voice reminder / call experience
- Current code includes incoming-call and WebRTC-related implementation. Treat it as experimental until real-device tests pass.
- Keep a simpler notification-first reminder path as the reliable baseline.
- Voice calls are optional and opt-in; explain permissions and data use.
- Support decline, snooze where backend semantics exist, and missed-call state.
- Test locked screen, background, app killed, battery saver, Wi-Fi/mobile handoff, poor network and Do Not Disturb.
- Document that two-way audio or spoken language support is limited if not implemented.

### Offline and resilience
- Cache only low-risk, explicitly selected read-only data.
- Show last-synced timestamp.
- Queue safe non-urgent edits only if conflict resolution and idempotency are implemented.
- Do not queue high-risk actions such as emergency dispatch or dose state changes without a deliberate design.
- Never show stale data as current.
- Provide clear offline, retry and session-expired states.

## 6. Mobile architecture

Recommended evolution, not an immediate rewrite:
- Keep Expo / React Native and the existing API contract.
- Use a typed API layer with shared response types where feasible.
- Separate navigation, screen orchestration, domain state and reusable UI.
- Introduce a query/cache library only if current request patterns justify it; assess React Native compatibility and bundle size.
- Use secure storage for credentials/tokens; do not store secrets in AsyncStorage.
- Define a secure local file-cache policy and clear sensitive files on logout.
- Add deep links for verification, share access and relevant notifications.
- Add crash/performance monitoring only with PHI-safe event design and consent.
- Add a release channel strategy: internal, beta and production.

## 7. Push and Android platform work

Before production:
1. Verify Firebase project configuration and Android package identity.
2. Verify FCM token registration and refresh.
3. Verify notification channel importance, sound, vibration and user controls.
4. Verify Notifee permission handling on supported Android versions.
5. Test Android 13+ notification permission.
6. Test exact alarm restrictions and battery optimization behaviour where applicable.
7. Validate foreground/background/terminated delivery.
8. Validate app upgrade and token rotation.
9. Verify no sensitive health details appear on lock-screen by default.
10. Provide a notification test screen with delivery diagnostics that does not expose secrets.

## 8. Security requirements

- Use HTTPS only in production.
- Secure session/token storage; prefer platform-backed secure storage.
- Clear auth state and private cache on logout.
- Certificate pinning is not a default requirement; evaluate operational risk and rotation strategy before adding it.
- Do not log tokens, session cookies, medical text, record filenames or call credentials.
- Validate deep links and share tokens; avoid leaking tokens into analytics.
- Keep notification payloads minimal (“You have a reminder”) rather than exposing medication names by default.
- Add device list/revoke controls.
- Protect WebRTC signalling and short-lived ICE credentials.
- Test Android backup rules to prevent unintended PHI backup.

## 9. Mobile performance and reliability

- Profile on a low/mid-range Android device, not only emulator.
- Reduce large image memory usage; resize/compress previews safely.
- Virtualize long record/medicine lists.
- Avoid repeated API calls on tab changes.
- Use loading skeletons and stable layouts.
- Test cold start, warm start, app resume, offline launch and session expiry.
- Track crashes, ANRs, startup time and screen transition latency without collecting PHI.

## 10. Mobile release gates

- [ ] Android build succeeds from a clean checkout.
- [ ] Login/logout/session expiry works.
- [ ] Hardware back and deep links work.
- [ ] Core journeys pass on at least two real Android devices.
- [ ] Notification permissions and channels behave correctly.
- [ ] Push works foreground/background/terminated or limitations are clearly documented.
- [ ] Dose actions reconcile with backend state.
- [ ] Upload/scan works on weak networks.
- [ ] Large text and TalkBack are checked.
- [ ] Emergency number action works without network dependency.
- [ ] Lock-screen notifications do not expose PHI by default.
- [ ] Privacy, Play policy and app signing requirements are reviewed.
- [ ] Web/mobile API compatibility is tested.
