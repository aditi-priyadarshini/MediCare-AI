/**
 * Where the MediCare AI server is. It is stored on the phone and can be changed on the sign-in
 * screen, so moving your PC to another Wi-Fi never needs a rebuild.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

export const API_PREFIX = "/api/v1";
export const APP_VERSION = "0.2.0";

// The Android emulator reaches the host computer at 10.0.2.2. A real phone needs your
// computer's Wi-Fi address instead, e.g. http://192.168.1.20:8000.
const FALLBACK = "http://10.0.2.2:8000";
const KEY = "mc.apiBase";

// How long to wait for server audio before the phone reads the reminder itself.
export const MEDIA_WAIT_MS = 8000;
// How long to wait for ICE gathering before sending the offer anyway.
export const ICE_GATHER_MS = 4000;

export function normalizeUrl(input: string): string {
  let u = input.trim();
  if (!u) return FALLBACK;
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u.replace(/\/+$/, "");
}

let cached: string | null = null;

export async function getBaseUrl(): Promise<string> {
  if (cached) return cached;
  const stored = await AsyncStorage.getItem(KEY).catch(() => null);
  const fromBuild = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  cached = normalizeUrl(stored || fromBuild || FALLBACK);
  return cached;
}

export async function setBaseUrl(url: string): Promise<string> {
  cached = normalizeUrl(url);
  await AsyncStorage.setItem(KEY, cached);
  return cached;
}

/** True when this build includes Firebase (google-services.json was present at build time). */
export const hasFirebase = Boolean(
  (Constants.expoConfig?.extra as { hasFirebase?: boolean } | undefined)?.hasFirebase,
);
