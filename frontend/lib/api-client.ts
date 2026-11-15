/**
 * Thin fetch wrapper for the MediCare API.
 *
 * - Same-origin (`/api/v1`, proxied by Next) so the HttpOnly session cookie is first-party.
 * - Sends the session-bound CSRF token on state-changing requests and retries once if the
 *   server says it is stale (e.g. after session rotation in another tab).
 * - Never logs request or response bodies.
 */
import type { AuthState } from "./types";

export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: FieldIssue[] = [],
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let csrfToken: string | null = null;
export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};
export const getCsrfToken = () => csrfToken;

const BASE = "/api/v1";

interface Options {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as {
      error?: { code?: string; message?: string; details?: FieldIssue[]; request_id?: string };
    };
    const e = data.error;
    return new ApiError(
      res.status,
      e?.code ?? "HTTP_ERROR",
      e?.message ?? "Something went wrong. Please try again.",
      e?.details ?? [],
      e?.request_id,
    );
  } catch {
    return new ApiError(res.status, "HTTP_ERROR", "Something went wrong. Please try again.");
  }
}

function send(path: string, { method = "GET", body, signal }: Options): Promise<Response> {
  const headers: Record<string, string> = {};
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  // FormData: the browser sets the multipart boundary itself.
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
}

export async function api<T = void>(path: string, options: Options = {}): Promise<T> {
  let res = await send(path, options);
  if (!res.ok && res.status === 403 && (options.method ?? "GET") !== "GET") {
    const err = await toError(res.clone());
    if (err.code === "CSRF_INVALID") {
      const me = await send("/auth/me", {});
      if (me.ok) {
        setCsrfToken(((await me.json()) as AuthState).csrf_token);
        res = await send(path, options);
      }
    }
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Map server field issues onto a {field: message} record for inline form errors. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(error.details.map((d) => [d.field, d.message]));
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "We couldn't reach the server. Check your connection and try again.";
}
