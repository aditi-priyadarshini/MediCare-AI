// TEMPORARY diagnostic: copy to frontend/tests/scan-debug.test.tsx, run it, then delete it.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanCapture } from "@/components/records/ScanCapture";
import { ApiError } from "@/lib/api-client";

const api = vi.fn();
vi.mock("@/lib/api-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/api-client")>()),
  api: (...a: unknown[]) => api(...a),
}));

const seen: string[] = [];
const onWin = (e: ErrorEvent) => seen.push("window error: " + String(e.error?.stack ?? e.message));
const onRej = (e: PromiseRejectionEvent) => seen.push("window unhandledrejection: " + String(e.reason?.stack ?? e.reason));
const onProc = (r: unknown) => seen.push("process unhandledRejection: " + String((r as Error)?.stack ?? r));

beforeEach(() => {
  api.mockReset();
  seen.length = 0;
  window.addEventListener("error", onWin);
  window.addEventListener("unhandledrejection", onRej);
  process.on("unhandledRejection", onProc);
});
afterEach(() => {
  window.removeEventListener("error", onWin);
  window.removeEventListener("unhandledrejection", onRej);
  process.off("unhandledRejection", onProc);
});

describe("debug", () => {
  it("scan failure", async () => {
    api.mockImplementation((path: string) =>
      path === "/records/scan/status"
        ? Promise.resolve({ available: true, photos: true, pdf_text: true, scanned_pdf: true })
        : Promise.reject(new ApiError(422, "IMAGE_UNREADABLE", "This image could not be opened.", [])),
    );
    render(<ScanCapture onScanned={vi.fn()} />);
    const steps: string[] = [];
    try {
      await screen.findByRole("button", { name: /take a photo/i });
      steps.push("status ok");
      await userEvent.upload(screen.getByLabelText("Choose a photo or PDF to scan"), new File(["x"], "bad.png", { type: "image/png" }));
      steps.push("upload ok");
      await screen.findByText("This image could not be opened.");
      steps.push("text found");
    } catch (e) {
      steps.push("REJECTED after [" + steps.join(" > ") + "]: " + String((e as Error)?.stack ?? e).slice(0, 600));
    }
    console.log("DEBUG steps:", steps.join(" > "));
    console.log("DEBUG calls:", JSON.stringify(api.mock.calls.map((c) => c[0])));
    console.log("DEBUG caught elsewhere:", seen.join("\n---\n") || "(nothing)");
    expect(true).toBe(true);
  });
});
