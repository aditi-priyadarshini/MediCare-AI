# MediCare AI phone app (reminder calls)

An Expo / React Native app that registers the phone with the MediCare AI backend and rings when a
dose is due. It signs in with the same account as the website. See `../docs/REMINDER_CALLS.md`
for the whole design and for what is and isn't tested.

> **Status: unbuilt reference implementation.** It was written without a device or the native
> toolchains, so nothing here has been compiled or run. The JavaScript is small and follows each
> library's documented API, but expect to fix version-specific details on first build.

## Create the project

Package versions change quickly, so let Expo pick compatible ones:

```bash
npx create-expo-app@latest medicare-mobile --template blank-typescript
cd medicare-mobile
npx expo install expo-speech expo-build-properties expo-dev-client
npm install react-native-webrtc @config-plugins/react-native-webrtc \
  react-native-incall-manager \
  @react-native-firebase/app @react-native-firebase/messaging \
  @notifee/react-native \
  react-native-callkeep react-native-voip-push-notification
```

Then copy this folder's `App.tsx`, `index.js`, `app.json` (merge the `plugins`, permissions and
bundle ids) and `src/` over the generated project, set `main` to `index.js` in `package.json`,
and edit `src/config.ts` (`API_BASE_URL`).

Put `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) from your Firebase
project in the project root. Use your own bundle id / package name in `app.json`; it must match
`APNS_BUNDLE_ID` on the server and the Firebase app.

## Build and run (development build, not Expo Go)

```bash
npx expo prebuild
npx expo run:android      # or: npx expo run:ios   (a real iPhone is needed for VoIP push)
```

## Native steps Expo can't do for you

**Android**
- In `MainActivity` (or via a config plugin) set `android:showWhenLocked="true"` and
  `android:turnScreenOn="true"` so the call screen appears over the lock screen.
- Android 14+: the user must allow *full-screen notifications* for the app. Ask them to also
  exempt the app from battery optimisation; many phones otherwise delay the push.
- `USE_FULL_SCREEN_INTENT` is restricted on Google Play (calling/alarm apps). See the
  limitations in `docs/REMINDER_CALLS.md`.

**iOS**
- Xcode → Signing & Capabilities: add *Push Notifications* and *Background Modes* (Voice over IP,
  Audio, Remote notifications). `app.json` sets the Info.plist modes.
- Follow `react-native-voip-push-notification` and `react-native-callkeep` setup for the
  `AppDelegate`: it must register for PushKit, forward the payload to JS, **and report the incoming
  call to CallKit natively on a cold start**. iOS terminates the app if a VoIP push is received and
  no call is reported.
- CallKit owns the audio session. `react-native-webrtc` and `react-native-incall-manager` need
  the session activated by CallKit (`didActivateAudioSession`) before audio plays; if the call
  connects but is silent on iPhone, this is the first place to look.

## How it behaves

1. Sign in. The app registers its push token(s) with `POST /devices`.
2. A push with only a `call_id` arrives. Android shows a looping full-screen "Reminder call"
   notification; iOS shows the CallKit call screen. Neither shows a medicine.
3. **Answer** → `POST /calls/{id}/accept` → the medicine appears → WebRTC offer/answer over the
   WebSocket → the server speaks. If that doesn't connect in about 12 s, or the server has no voice,
   the phone reads the same text itself.
4. **I took it** → `POST /doses/{id}/take`. **Not now** just ends the call and leaves the dose
   pending. **Skip this dose** → `POST /doses/{id}/skip`.
5. **Decline** (from the ring) → `POST /calls/{id}/decline`. A declined call is never retried.

Signing out removes the device (`DELETE /devices/{id}`) so the next person on the phone doesn't
inherit the ring; the backend also moves a push token to whoever signs in next.
