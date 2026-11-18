# MediCare AI: Android app

Expo / React Native app (Android only) that mirrors the website and rings when a dose is due.

**Start with [ANDROID_SETUP_AND_TEST.md](ANDROID_SETUP_AND_TEST.md).**

- `src/screens/` the website's pages for the phone; `src/calls/` ringing, WebRTC and the call screen
- `src/api.ts` the one place that talks to the server (cookie session + CSRF, like the website)
- `app.config.js` native config; Firebase is switched on only if `google-services.json` exists
- `npm run typecheck` checks the code; `npx expo prebuild --platform android` regenerates `android/`
