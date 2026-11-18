/**
 * Minimal client for the MediCare AI API. It reuses the web app's auth: the session cookie
 * (kept by the OS networking stack) plus the session-bound CSRF token on unsafe requests.
 * Request and response bodies are never logged.
 */
import { API_BASE_URL, API_PREFIX } from "./config";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let csrf: string | null = null;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  // A background/headless start has the session cookie but not the CSRF token: fetch it first.
  if (method !== "GET" && !csrf && path !== "/auth/login") {
    await call<AuthState>("GET", "/auth/me");
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrf) headers["X-CSRF-Token"] = csrf;
  const res = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, e?.code ?? "HTTP_ERROR", e?.message ?? "Something went wrong.");
  }
  if (data && typeof data === "object" && "csrf_token" in data) {
    csrf = (data as { csrf_token: string }).csrf_token;
  }
  return data as T;
}

export interface AuthState {
  user: { id: string; email: string; display_name: string | null };
  csrf_token: string;
}
export interface Call {
  id: string;
  status: "ringing" | "answered" | "completed" | "declined" | "missed" | "failed";
  ring_expires_at: string;
}
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
export interface Accept {
  call: Call;
  dose: {
    dose_id: string;
    medication_name: string;
    dose_text: string | null;
    scheduled_at: string | null;
    status: string;
    spoken_text: string;
  };
  ticket: string;
  ws_path: string;
  ice_servers: IceServer[];
}

let deviceId: string | null = null;

export const api = {
  login: (email: string, password: string) => call<AuthState>("POST", "/auth/login", { email, password }),
  me: () => call<AuthState>("GET", "/auth/me"),
  logout: () => call<void>("POST", "/auth/logout"),
  registerDevice: async (d: {
    platform: "android" | "ios";
    push_token: string;
    voip_token?: string | null;
    app_version: string;
  }) => {
    const r = await call<{ id: string }>("POST", "/devices", d);
    deviceId = r.id;
    return r;
  },
  /** Call before logging out so the next person on this phone doesn't inherit the ring. */
  forgetDevice: async () => {
    if (!deviceId) return;
    await call<void>("DELETE", `/devices/${deviceId}`).catch(() => {});
    deviceId = null;
  },
  getCall: (id: string) => call<Call>("GET", `/calls/${id}`),
  acceptCall: (id: string) => call<Accept>("POST", `/calls/${id}/accept`),
  declineCall: (id: string) => call<Call>("POST", `/calls/${id}/decline`),
  endCall: (id: string) => call<Call>("POST", `/calls/${id}/end`),
  // The only way a dose becomes "taken": the patient's own tap, through the ordinary endpoint.
  takeDose: (id: string) => call("POST", `/doses/${id}/take`, {}),
  skipDose: (id: string) => call("POST", `/doses/${id}/skip`, {}),
};
