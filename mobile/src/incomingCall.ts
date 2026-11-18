/**
 * Makes the phone ring when the server starts a reminder call, even if the app is closed.
 *
 *  Android: an FCM *data* push wakes a background handler, which shows a full-screen,
 *           looping "incoming call" notification (notifee) with Answer / Decline.
 *  iOS:     a PushKit VoIP push is delivered to JS, which must immediately report a CallKit
 *           incoming call (react-native-callkeep). iOS kills apps that receive a VoIP push and
 *           don't do this, so the native AppDelegate must also report it on a cold start (see
 *           README, "iOS native setup").
 *
 * The push only carries a call id. The call screen asks the server for the medicine after the
 * patient answers, so nothing sensitive is on the lock screen.
 */
import { Platform } from "react-native";
import messaging from "@react-native-firebase/messaging";
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  EventType,
} from "@notifee/react-native";
import RNCallKeep from "react-native-callkeep";
import VoipPushNotification from "react-native-voip-push-notification";
import { api } from "./api";
import { APP_VERSION } from "./config";

const CHANNEL = "reminder-calls";
const RING_MS = 45_000;

export interface CallEvents {
  onAnswer: (callId: string) => void;
  onDecline: (callId: string) => void;
}

// ------------------------------------------------------------------ Android ringing UI
async function showAndroidRinging(callId: string) {
  await notifee.createChannel({
    id: CHANNEL,
    name: "Medicine reminder calls",
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    vibration: true,
    sound: "default",
  });
  await notifee.displayNotification({
    id: callId,
    title: "MediCare AI",
    body: "Reminder call", // deliberately generic: this is shown on the lock screen
    data: { callId },
    android: {
      channelId: CHANNEL,
      category: AndroidCategory.CALL,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      ongoing: true,
      autoCancel: false,
      loopSound: true,
      timeoutAfter: RING_MS,
      fullScreenAction: { id: "default", launchActivity: "default" },
      pressAction: { id: "answer", launchActivity: "default" },
      actions: [
        { title: "Answer", pressAction: { id: "answer", launchActivity: "default" } },
        { title: "Decline", pressAction: { id: "decline" } },
      ],
    },
  });
}

/** Call once at startup in index.js, before AppRegistry.registerComponent. Runs headless. */
export function registerBackgroundHandlers() {
  if (Platform.OS !== "android") return;
  messaging().setBackgroundMessageHandler(async (msg) => {
    if (msg.data?.type === "reminder_call" && typeof msg.data.call_id === "string") {
      await showAndroidRinging(msg.data.call_id);
    }
  });
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    const callId = detail.notification?.data?.callId as string | undefined;
    if (!callId) return;
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === "decline") {
      await notifee.cancelNotification(callId);
      await api.declineCall(callId).catch(() => {});
    }
  });
}

// ---------------------------------------------------------------------- shared set-up
/** Wires push registration and ring/answer/decline events. Returns an unsubscribe function. */
export async function setupIncomingCalls(events: CallEvents): Promise<() => void> {
  const unsubs: Array<() => void> = [];

  if (Platform.OS === "android") {
    await notifee.requestPermission(); // Android 13+ notification permission
    await messaging().requestPermission();
    const register = async (token: string) =>
      api.registerDevice({ platform: "android", push_token: token, app_version: APP_VERSION });
    await register(await messaging().getToken());
    unsubs.push(messaging().onTokenRefresh((t) => void register(t).catch(() => {})));
    unsubs.push(
      messaging().onMessage(async (msg) => {
        if (msg.data?.type === "reminder_call" && typeof msg.data.call_id === "string") {
          await showAndroidRinging(msg.data.call_id);
        }
      }),
    );
    unsubs.push(
      notifee.onForegroundEvent(({ type, detail }) => {
        const callId = detail.notification?.data?.callId as string | undefined;
        if (!callId) return;
        if (type === EventType.PRESS || (type === EventType.ACTION_PRESS && detail.pressAction?.id === "answer")) {
          void notifee.cancelNotification(callId);
          events.onAnswer(callId);
        } else if (type === EventType.ACTION_PRESS && detail.pressAction?.id === "decline") {
          void notifee.cancelNotification(callId);
          events.onDecline(callId);
        }
      }),
    );
    // App was launched by tapping the ringing notification or its Answer button.
    const initial = await notifee.getInitialNotification();
    const initialId = initial?.notification?.data?.callId as string | undefined;
    if (initialId && initial?.pressAction?.id !== "decline") events.onAnswer(initialId);
  } else {
    RNCallKeep.setup({
      ios: { appName: "MediCare AI", supportsVideo: false },
      android: { alertTitle: "", alertDescription: "", cancelButton: "", okButton: "", additionalPermissions: [] },
    });
    // The call id is a UUID, so it doubles as the CallKit call UUID.
    RNCallKeep.addEventListener("answerCall", ({ callUUID }) => events.onAnswer(callUUID.toLowerCase()));
    RNCallKeep.addEventListener("endCall", ({ callUUID }) => events.onDecline(callUUID.toLowerCase()));

    let voipToken: string | null = null;
    let apnsToken: string | null = null;
    const push = () => {
      if (voipToken) {
        void api
          .registerDevice({
            platform: "ios",
            push_token: apnsToken ?? voipToken,
            voip_token: voipToken,
            app_version: APP_VERSION,
          })
          .catch(() => {});
      }
    };
    await messaging().requestPermission();
    apnsToken = await messaging().getAPNSToken().catch(() => null);
    VoipPushNotification.addEventListener("register", (token: string) => {
      voipToken = token;
      push();
    });
    VoipPushNotification.addEventListener("notification", (n: { call_id?: string }) => {
      if (n?.call_id) {
        RNCallKeep.displayIncomingCall(n.call_id, "MediCare AI", "MediCare AI", "generic", false);
      }
    });
    VoipPushNotification.registerVoipToken();
    unsubs.push(() => {
      RNCallKeep.removeEventListener("answerCall");
      RNCallKeep.removeEventListener("endCall");
      VoipPushNotification.removeEventListener("register");
      VoipPushNotification.removeEventListener("notification");
    });
  }

  return () => unsubs.forEach((u) => u());
}

/** Stop ringing (e.g. after the call ended on the server). */
export async function dismissIncoming(callId: string) {
  if (Platform.OS === "android") await notifee.cancelNotification(callId);
  else RNCallKeep.endCall(callId);
}
