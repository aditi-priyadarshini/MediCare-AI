import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, fieldErrors, setCsrfToken } from "@/lib/api-client";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken(null);
});
afterEach(() => vi.unstubAllGlobals());

const headersOf = (call: number) => (fetchMock.mock.calls[call]![1] as RequestInit).headers as Record<string, string>;

describe("api client", () => {
  it("sends the CSRF token on writes but not on reads", async () => {
    setCsrfToken("tok");
    fetchMock.mockImplementation(async () => json(200, { ok: true }));
    await api("/profile");
    await api("/profile", { method: "PUT", body: { a: 1 } });
    expect(headersOf(0)["X-CSRF-Token"]).toBeUndefined();
    expect(headersOf(1)["X-CSRF-Token"]).toBe("tok");
    expect(headersOf(1)["Content-Type"]).toBe("application/json");
  });

  it("sends FormData untouched, without a JSON content type, and still adds CSRF", async () => {
    setCsrfToken("tok");
    fetchMock.mockImplementation(async () => json(200, {}));
    const body = new FormData();
    body.append("file", new Blob(["%PDF-"], { type: "application/pdf" }), "a.pdf");
    await api("/records/1/file", { method: "POST", body });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe(body);
    expect(headersOf(0)["Content-Type"]).toBeUndefined();
    expect(headersOf(0)["X-CSRF-Token"]).toBe("tok");
  });

  it("uses same-origin credentials and never caches", async () => {
    fetchMock.mockImplementation(async () => json(200, {}));
    await api("/auth/me");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
  });

  it("maps the error envelope to ApiError", async () => {
    fetchMock.mockImplementation(async () =>
      json(422, {
        error: { code: "VALIDATION_ERROR", message: "bad", request_id: "r1", details: [{ field: "email", message: "invalid" }] },
      }),
    );
    const err = await api("/x", { method: "POST", body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: "VALIDATION_ERROR", requestId: "r1" });
    expect(fieldErrors(err)).toEqual({ email: "invalid" });
  });

  it("refreshes a stale CSRF token once and retries", async () => {
    setCsrfToken("stale");
    fetchMock
      .mockResolvedValueOnce(json(403, { error: { code: "CSRF_INVALID", message: "x" } }))
      .mockResolvedValueOnce(json(200, { user: {}, csrf_token: "fresh" }))
      .mockResolvedValueOnce(json(200, { saved: true }));
    await expect(api("/profile", { method: "PUT", body: {} })).resolves.toEqual({ saved: true });
    expect(headersOf(2)["X-CSRF-Token"]).toBe("fresh");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry other 403s", async () => {
    fetchMock.mockImplementation(async () => json(403, { error: { code: "EMAIL_NOT_VERIFIED", message: "Verify" } }));
    await expect(api("/profile", { method: "PUT", body: {} })).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns undefined for 204", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    await expect(api("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("survives a non-JSON error body", async () => {
    fetchMock.mockImplementation(async () => new Response("<html>502</html>", { status: 502 }));
    await expect(api("/x")).rejects.toMatchObject({ status: 502, code: "HTTP_ERROR" });
  });
});
