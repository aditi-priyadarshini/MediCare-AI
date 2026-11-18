# MediCare AI for Android: set up and test reminder calls

This is the Android phone app for MediCare AI. It looks like the website, and it **rings like an
incoming call** when a dose is due: you answer, the server speaks the reminder over WebRTC, and
you tap **I took it**, **Not now** or **Skip**.

## What has been checked, and what has not

| Checked here | How |
|---|---|
| The server side of a call: sign in, ring, answer, WebRTC signalling, real synthesized voice, audio arriving | `python -m app.scripts.call_smoke` against a running server (25 audio frames received) |
| Backend rules (consent, no double rings, a call never marks a dose, the new test endpoint) | 36 automated tests, all pass |
| The app compiles | `tsc` type-check passes against the real library versions (Expo SDK 58, React Native 0.88) |
| The Android native project generates, with and without Firebase | `expo prebuild`; the manifest has no camera or microphone permission |

| **Not** checked (needs a real phone or emulator) | |
|---|---|
| Building the APK itself | No Android toolchain here. The first build may need small fixes. |
| Ringing on a real phone, the lock-screen call screen, Firebase push | Test in the order below. |
| WebRTC audio reaching a phone over your Wi-Fi | Depends on your network (see Troubleshooting). |

If audio does not connect, the app reads the same reminder with the phone's own voice, so the
reminder is still heard. The reason is shown on the call screen.

---

## Part 1. Run the server

You need Python 3.12, Docker (for the database only) and this repository.

1. **Database**, from the repository root:
   ```
   copy .env.example .env          (Windows)   |   cp .env.example .env   (Mac/Linux)
   ```
   Open `.env`, set `POSTGRES_PASSWORD=` to any password and `SECRET_KEY=` to the output of
   `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Then:
   ```
   docker compose up -d postgres
   ```
2. **Backend environment**, in `backend/`:
   ```
   python -m venv .venv
   .venv\Scripts\activate            (Windows)   |   source .venv/bin/activate   (Mac/Linux)
   pip install -r requirements.txt
   ```
3. **Settings.** Set these in the same terminal (Windows PowerShell uses `$env:NAME="value"`):
   ```
   DATABASE_URL=postgresql+psycopg://medicare:<your POSTGRES_PASSWORD>@localhost:5432/medicare
   SECRET_KEY=<the same value as in .env>
   ENVIRONMENT=development
   CALLS_ENABLED=true
   STUN_URLS=stun:stun.l.google.com:19302
   TTS_COMMAND=espeak-ng --stdin -w {out}
   ```
   `TTS_COMMAND` is the server's voice. Install eSpeak NG (`sudo apt install espeak-ng`, or the
   Windows installer from the eSpeak NG releases page) or use Piper (see
   `docs/REMINDER_CALLS.md`). Without it the call still connects but the *phone* speaks.
4. **Create tables and a test account:**
   ```
   alembic upgrade head
   set DEMO_PASSWORD=Choose-A-Long-Password-1 && python -m app.scripts.seed_demo
   ```
   (Mac/Linux: `DEMO_PASSWORD=... python -m app.scripts.seed_demo`.) Sign in as
   `demo.patient@example.com`.
5. **Start the API so your phone can reach it:**
   ```
   python -m uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000
   ```
   Run it directly like this, **not in Docker**, for phone tests. The compose file only listens on
   `127.0.0.1`, and a Docker container advertises an internal address that a phone cannot send
   audio to.
6. **Find your computer's Wi-Fi address** (`ipconfig` on Windows, `ip addr` on Linux). Say it is
   `192.168.1.20`. Allow port 8000 through the firewall. Your phone must be on the same Wi-Fi.
   From the phone's browser, `http://192.168.1.20:8000/health/ready` should show `{"status":"ok"}`.

### Prove the server works before touching Android

```
python -m app.scripts.call_smoke --email demo.patient@example.com
```
It acts as a phone. You should see `PASS server-side reminder call works`. If it says
`PARTIAL ... no server voice`, fix `TTS_COMMAND`. If it says no audio arrived, see Troubleshooting.

---

## Part 2. Build the app

**First, copy the `mobile` folder somewhere outside the git repository** (for example
`C:\medicare-android`) and work there. This avoids the repository's `.gitignore` hiding files from
the build.

Install Node.js 20 or newer, then in that folder: `npm install`.

### Option A (no Android Studio): Expo cloud build

```
npx eas-cli@latest login
npx eas-cli@latest init            (paste the project id it prints into EAS_PROJECT_ID in app.config.js)
npx eas-cli@latest build --platform android --profile preview
```
Free Expo account needed. When it finishes you get a link/QR for an `.apk`: open it on the phone
and install (allow "install unknown apps").

### Option B: build on your computer

Install Android Studio (it brings the SDK) and JDK 17, enable USB debugging on the phone, plug it
in, then:
```
npx expo run:android
```
For an emulator, create one in Android Studio first (Pixel with a "Google Play" image).

---

## Part 3. Test, in this order

Each step isolates one thing, so a failure tells you where to look.

### Step 1: the call, no Firebase needed
1. Open the app. Enter the **server address**: emulator `http://10.0.2.2:8000`, real phone
   `http://192.168.1.20:8000`. Sign in with the demo account.
2. **More → Settings → Test call (no push)**.
3. The call screen appears. You should hear a voice read "Hello, this is your MediCare AI
   reminder…". The badge says **server voice** (WebRTC worked) or **Reading your reminder aloud**
   (it fell back to the phone voice, and tells you why).
4. Tap **I took it**. Nothing is marked until you tap.

### Step 2: push, so the phone rings when the app is closed
1. Firebase console → create a project → **Add app → Android**. The package name must be
   `org.example.medicare` (or change `android.package` in `app.config.js` first).
2. Download `google-services.json` into the app folder (next to `app.config.js`). **Rebuild** the
   app (Part 2). Firebase is read at build time.
3. Firebase → Project settings → **Service accounts → Generate new private key**. Save the file as
   `secrets/fcm.json` in the repository (it is git-ignored; never commit it). Add to the server
   settings and restart it:
   ```
   FCM_PROJECT_ID=<your Firebase project id>
   FCM_SERVICE_ACCOUNT_FILE=<full path to secrets/fcm.json>
   ```
4. Sign in on the phone and allow notifications. **Settings** should say *This phone can be woken*.
5. Tap **Ring me in 15 seconds (push)**, then **lock the phone or swipe the app away**. It should
   ring with an Answer / Decline notification, or a full-screen call if locked.

### Step 3: the real thing
1. Settings → switch **Ring my phone when a dose is due** on.
2. Add a medicine with a time two minutes from now (24-hour clock).
3. Run the worker with the same settings as the server:
   `python -m app.scripts.run_worker`
4. At that time the phone rings.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| "Can't reach the server" | Wrong address, different Wi-Fi, or firewall. Try the `/health/ready` URL in the phone browser. Emulator must use `10.0.2.2`. |
| Sign-in works, then every screen says signed out | The server is running with `COOKIE_SECURE=true` over plain http. Keep `ENVIRONMENT=development`. |
| Test call says 404 | Server is not `ENVIRONMENT=development` with `CALLS_ENABLED=true`. This is deliberate: the test endpoint does not exist in production. |
| Call connects but you hear the phone voice | WebRTC audio did not connect; the reason is on screen. Run the server outside Docker, stay on the same Wi-Fi, or set up TURN (`docs/REMINDER_CALLS.md`). |
| "no server voice" | `TTS_COMMAND` not set or the program is not installed. |
| Push never arrives | Notifications off for the app; no `google-services.json` at build time; wrong `FCM_PROJECT_ID`; on Xiaomi, Oppo, Vivo or Samsung set the app's battery to *Unrestricted*. Check the server log for `reminder_call_push_failed`. |
| Rings but no full-screen call on Android 14+ | Settings → Apps → MediCare AI → allow *Full-screen notifications*. |
| Build fails | Read the first red error. Likely a Gradle or SDK version mismatch from the newest libraries; send it to me and I will fix it. |

## What the app includes

Home with today's doses (take, skip, undo), refill and expiry alerts and the safety status;
Medicines (list, details, schedules, stock, add, pause, stop); Ask AI chat; Records and Lab results
with trends; Health profile; Safety checker; Find care (call a doctor or pharmacy); Emergency (call
112, your emergency summary); Care sharing (see and stop shares); Notifications; Settings (reminder
call switch, privacy switches, larger text, high contrast, server address).

**On the website only:** creating an account, password reset, Diet plans, Feedback, uploading and
scanning records, editing the profile, booking appointments, creating share links, Admin. iOS is not
part of this app (the backend still supports it).

## Before you publish this to other people

- The test build allows plain `http` for development. Use https and set
  `usesCleartextTraffic: false` in `app.config.js`.
- Google Play restricts full-screen call notifications to calling and alarm apps, and may reject a
  medicine reminder that rings. Side-loaded or private distribution is not affected. Check current
  policy first.
- Do not ship the development server settings (`ENVIRONMENT=development`).
