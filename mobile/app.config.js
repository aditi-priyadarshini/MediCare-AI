/**
 * Expo config for the MediCare AI Android app.
 *
 * Firebase is OPTIONAL at build time: put google-services.json next to this file to turn on
 * push (the phone rings with the app closed). Without it the app still builds and runs, and
 * you can test the WebRTC call with the in-app "Test call (no push)" button.
 */
const fs = require("fs");
const path = require("path");

// Only needed for cloud builds with EAS: run `npx eas-cli@latest init`, then paste the id here.
const EAS_PROJECT_ID = "";

const hasFirebase = fs.existsSync(path.join(__dirname, "google-services.json"));

module.exports = () => ({
  expo: {
    name: "MediCare AI",
    slug: "medicare-ai",
    version: "0.2.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    backgroundColor: "#faf9f6",
    android: {
      // Must match the Android app you register in Firebase (see ANDROID_SETUP_AND_TEST.md).
      package: "org.example.medicare",
      versionCode: 2,
      adaptiveIcon: {
        backgroundColor: "#157873",
        foregroundImage: "./assets/android-icon-foreground.png",
      },
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.USE_FULL_SCREEN_INTENT",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.VIBRATE",
      ],
      ...(hasFirebase ? { googleServicesFile: "./google-services.json" } : {}),
    },
    plugins: [
      [
        "expo-build-properties",
        {
          android: {
            // Lets a development build talk to http://<your-pc>:8000 on the same Wi-Fi.
            // Switch this off (and use https) for anything you give to other people.
            usesCleartextTraffic: true,
          },
        },
      ],
      "./plugins/withCallScreen",
      ...(hasFirebase ? ["@react-native-firebase/app"] : []),
    ],
    extra: {
      hasFirebase,
      apiUrl: process.env.EXPO_PUBLIC_API_URL || "",
      ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
    },
  },
});
