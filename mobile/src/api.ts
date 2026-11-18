/**
 * Client for the MediCare AI API. It reuses the website's sign-in: the session cookie (kept by
 * Android's networking stack and good for 7 days) plus the session-bound CSRF token on every
 * change. Bodies and responses are never logged.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_PREFIX, getBaseUrl } from "./config";
import type * as T from "./types";

export const errorTextOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let csrf: string | null = null;
let onSignedOut: (() => void) | null = null;
/** The app registers one handler: it runs when the server says the session is gone. */
export function setSignedOutHandler(fn: (() => void) | null) {
  onSignedOut = fn;
}

async function call<R>(method: string, path: string, body?: unknown): Promise<R> {
  const base = await getBaseUrl();
  // A background (app closed) start has the session cookie but not the CSRF token: fetch it.
  if (method !== "GET" && !csrf && path !== "/auth/login") {
    await call<T.AuthState>("GET", "/auth/me");
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrf) headers["X-CSRF-Token"] = csrf;

  let res: Response;
  try {
    res = await fetch(`${base}${API_PREFIX}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", `Can't reach the server at ${base}. Check the address and your connection.`);
  }
  if (res.status === 204) return undefined as R;
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } }).error;
    if (res.status === 401 && path !== "/auth/login" && path !== "/auth/me") onSignedOut?.();
    throw new ApiError(res.status, e?.code ?? "HTTP_ERROR", e?.message ?? "Something went wrong.");
  }
  if (data && typeof data === "object" && "csrf_token" in data) {
    csrf = (data as { csrf_token: string }).csrf_token;
  }
  return data as R;
}

const get = <R>(p: string) => call<R>("GET", p);
const post = <R>(p: string, b: unknown = {}) => call<R>("POST", p, b);
const put = <R>(p: string, b: unknown) => call<R>("PUT", p, b);
const patch = <R>(p: string, b: unknown) => call<R>("PATCH", p, b);
const del = <R>(p: string) => call<R>("DELETE", p);
const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const parts = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
};

// ----------------------------------------------------------------------------- device id
const DEVICE_KEY = "mc.deviceId";

export const api = {
  // auth
  login: (email: string, password: string) => post<T.AuthState>("/auth/login", { email, password }),
  me: () => get<T.AuthState>("/auth/me"),
  logout: () => post<void>("/auth/logout"),
  forgetSession: () => {
    csrf = null;
  },

  // profile and health
  profile: () => get<T.Profile>("/profile"),
  conditions: () => get<T.Page<T.Condition>>("/conditions?limit=100"),
  allergies: () => get<T.Page<T.Allergy>>("/allergies?limit=100"),
  contacts: () => get<T.Page<T.Contact>>("/emergency/contacts?limit=100"),
  consents: () => get<T.Consent[]>("/consents"),
  setConsent: (type: T.ConsentType, granted: boolean) => put<T.Consent[]>(`/consents/${type}`, { granted }),

  // medicines and doses
  medications: (includeInactive = false) =>
    get<T.Page<T.Medication>>(`/medications${qs({ include_inactive: includeInactive || undefined, limit: 100 })}`),
  medication: (id: string) => get<T.Medication>(`/medications/${id}`),
  schedules: (id: string) => get<T.Schedule[]>(`/medications/${id}/schedules`),
  supplies: (id: string) => get<T.Supply[]>(`/medications/${id}/supplies`),
  createMedication: (b: { display_name: string; dose_text?: string; instructions?: string; reason?: string }) =>
    post<T.Medication>("/medications", b),
  createSchedule: (medId: string, b: { times: string[]; start_date: string }) =>
    post<T.Schedule>(`/medications/${medId}/schedules`, b),
  setMedicationStatus: (id: string, status: T.MedicationStatus) => patch<T.Medication>(`/medications/${id}`, { status }),
  doses: (fromIso: string, toIso: string) =>
    get<T.Page<T.Dose>>(`/doses${qs({ from: fromIso, to: toIso, limit: 100 })}`),
  takeDose: (id: string) => post<T.Dose>(`/doses/${id}/take`, {}),
  skipDose: (id: string) => post<T.Dose>(`/doses/${id}/skip`, {}),
  resetDose: (id: string) => post<T.Dose>(`/doses/${id}/reset`, {}),
  alerts: () => get<T.Alert[]>("/medications/alerts"),
  notifications: () => get<T.Page<T.AppNotification>>("/notifications?limit=50"),
  unreadCount: () => get<{ count: number }>("/notifications/unread-count"),
  markRead: (id: string) => post<T.AppNotification>(`/notifications/${id}/read`, {}),
  markAllRead: () => post<void>("/notifications/read-all", {}),

  // safety
  safetyOverview: () => post<T.SafetyOverview>("/safety/overview", {}),

  // AI assistant
  assistantStatus: () => get<T.AssistantStatus>("/assistant/status"),
  sessions: () => get<T.Page<T.SessionBrief>>("/assistant/sessions?limit=50"),
  createSession: () => post<T.SessionDetail>("/assistant/sessions", { language: "en", context: {} }),
  session: (id: string) => get<T.SessionDetail>(`/assistant/sessions/${id}`),
  ask: (id: string, content: string) =>
    post<{ user_message: T.ChatMessage; assistant_message: T.ChatMessage }>(
      `/assistant/sessions/${id}/messages`,
      { content },
    ),
  deleteSession: (id: string) => del<void>(`/assistant/sessions/${id}`),

  // records and labs
  records: () => get<T.Page<T.RecordItem>>("/records?limit=100"),
  labTests: () => get<T.LabSummary[]>("/labs/tests"),
  labTrend: (name: string) => get<T.LabTrend>(`/labs/trend${qs({ test_name: name })}`),

  // find care
  doctors: (q: string, city: string) =>
    get<T.CareSearch<T.Doctor>>(`/doctors/search${qs({ q, city, limit: 20 })}`),
  pharmacies: (q: string, city: string) =>
    get<T.CareSearch<T.Pharmacy>>(`/pharmacies/search${qs({ q, city, limit: 20 })}`),

  // emergency and sharing
  emergencyStatus: () => get<T.EmergencyStatus>("/emergency/status"),
  emergencySummary: () => get<T.EmergencySummary>("/emergency/summary"),
  shares: () => get<T.Page<T.Share>>("/shares?limit=50"),
  revokeShare: (id: string) => post<T.Share>(`/shares/${id}/revoke`, {}),

  // phone registration and reminder calls
  registerDevice: async (d: {
    platform: "android" | "ios";
    push_token: string;
    voip_token?: string | null;
    app_version: string;
  }) => {
    const r = await post<T.Device>("/devices", d);
    await AsyncStorage.setItem(DEVICE_KEY, r.id).catch(() => {});
    return r;
  },
  devices: () => get<T.Device[]>("/devices"),
  /** Call before signing out so the next person on this phone doesn't inherit the ring. */
  forgetDevice: async () => {
    const id = await AsyncStorage.getItem(DEVICE_KEY).catch(() => null);
    if (!id) return;
    await del<void>(`/devices/${id}`).catch(() => {});
    await AsyncStorage.removeItem(DEVICE_KEY).catch(() => {});
  },
  getCall: (id: string) => get<T.Call>(`/calls/${id}`),
  acceptCall: (id: string) => post<T.Accept>(`/calls/${id}/accept`),
  declineCall: (id: string) => post<T.Call>(`/calls/${id}/decline`),
  endCall: (id: string) => post<T.Call>(`/calls/${id}/end`),
  /** Development servers only (404 elsewhere): ring this account's phone for a throw-away dose. */
  devTestCall: (mode: "direct" | "push", delaySeconds = 0) =>
    post<T.Call>("/calls/dev/test", { mode, delay_seconds: delaySeconds }),
};
