/**
 * Makes the phone ring when the server starts a reminder call, even with the app closed.
 *
 * An FCM *data* push wakes a background handler, which shows a full-screen, looping "incoming
 * call" notification (notifee) with Answer / Decline. The push carries only a call id; the
 * medicine is fetched after the patient answers, so nothing sensitive is on the lock screen.
 *
 * Without google-services.json at build time (hasFirebase = false) there is no push. The app
 * still works and the in-app "Test call (no push)" button exercises everything else.
 */
import notifee, { AndroidCategory, AndroidImportance, AndroidVisibility, EventType } from "@notifee/react-native";
import { api } from "../api";
import { APP_VERSION, hasFirebase } from "../config";

const CHANNEL = "reminder-calls";
const RING_MS = 45_000;

export interface CallEvents {
  onAnswer: (callId: string) => void;
  onDecline: (callId: string) => void;
}

export type PushStatus = "unavailable" | "starting" | "registered" | "no_permission" | "error";
let pushStatus: PushStatus = hasFirebase ? "starting" : "unavailable";
let pushDetail = hasFirebase ? "" : "This build has no Firebase file, so the phone cannot be woken by a push.";
export const getPushStatus = () => ({ status: pushStatus, detail: pushDetail });

// Loaded lazily so a build without Firebase never touches the native module.
type FcmModule = typeof import("@react-native-firebase/messaging");
function fcm(): { M: FcmModule; m: ReturnType<FcmModule["getMessaging"]> } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const M = require("@react-native-firebase/messaging") as FcmModule;
  return { M, m: M.getMessaging() };
}

async function showRinging(callId: string) {
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
    body: "Reminder call", // deliberately generic: shown on the lock screen
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

/** Call once in index.ts, before the app registers. Runs headless when the app is closed. */
export function registerBackgroundHandlers() {
  if (hasFirebase) {
    try {
      const { M, m } = fcm();
      M.setBackgroundMessageHandler(m, async (msg) => {
        if (msg.data?.type === "reminder_call" && typeof msg.data.call_id === "string") {
          await showRinging(msg.data.call_id);
        }
      });
    } catch {
      /* Firebase not initialised: nothing to register */
    }
  }
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    const callId = detail.notification?.data?.callId as string | undefined;
    if (!callId) return;
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === "decline") {
      await notifee.cancelNotification(callId);
      await api.declineCall(callId).catch(() => {});
    }
  });
}

/** Registers this phone and wires ring / answer / decline. Returns an unsubscribe function. */
export async function setupIncomingCalls(events: CallEvents): Promise<() => void> {
  const unsubs: Array<() => void> = [];
  await notifee.requestPermission().catch(() => {}); // Android 13+ notification permission

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
  const initial = await notifee.getInitialNotification().catch(() => null);
  const initialId = initial?.notification?.data?.callId as string | undefined;
  if (initialId && initial?.pressAction?.id !== "decline") events.onAnswer(initialId);

  if (hasFirebase) {
    try {
      const { M, m } = fcm();
      const perm = await M.requestPermission(m);
      // 0 = denied. Anything else (authorised / provisional / Android default) is fine.
      if (perm === 0) {
        pushStatus = "no_permission";
        pushDetail = "Notifications are switched off for this app in Android settings.";
      }
      const register = async (token: string) => {
        await api.registerDevice({ platform: "android", push_token: token, app_version: APP_VERSION });
        if (pushStatus !== "no_permission") {
          pushStatus = "registered";
          pushDetail = "";
        }
      };
      await register(await M.getToken(m));
      unsubs.push(M.onTokenRefresh(m, (t) => void register(t).catch(() => {})));
      unsubs.push(
        M.onMessage(m, async (msg) => {
          if (msg.data?.type === "reminder_call" && typeof msg.data.call_id === "string") {
            await showRinging(msg.data.call_id);
          }
        }),
      );
    } catch (e) {
      pushStatus = "error";
      pushDetail = e instanceof Error ? e.message : "Push registration failed.";
    }
  }
  return () => unsubs.forEach((u) => u());
}

/** Stop ringing (after answering, or once the call ended on the server). */
export async function dismissIncoming(callId: string) {
  await notifee.cancelNotification(callId).catch(() => {});
}
