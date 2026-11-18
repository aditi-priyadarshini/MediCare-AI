import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LabImport } from "@/components/records/LabImport";
import { ScanCapture } from "@/components/records/ScanCapture";
import { ApiError } from "@/lib/api-client";
import {
  applyScanToRecord,
  bulkLabsBody,
  cameraErrorMessage,
  dateProblem,
  filledSummary,
  reviewProblems,
  reviewRows,
  type ScanResult,
} from "@/lib/scan";

const api = vi.fn();
vi.mock("@/lib/api-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/api-client")>()),
  api: (...a: unknown[]) => api(...a),
}));

const scan = (over: Partial<ScanResult> = {}): ScanResult => ({
  method: "ocr",
  pages_read: 1,
  pages_total: 1,
  text_found: true,
  record: { record_type: "lab_report", title: "Complete blood count", record_date: "2026-11-12", date_ambiguous: false, provider_name: "Sunrise Diagnostics" },
  labs: [
    { test_name: "Hemoglobin", result: "11.2", unit: "g/dL", ref_low: 12, ref_high: 15.5, confidence: "high", source_line: "Hemoglobin 11.2 g/dL 12.0 - 15.5" },
    { test_name: "HIV 1 & 2", result: "Non-reactive", unit: null, ref_low: null, ref_high: null, confidence: "medium", source_line: "HIV 1 & 2 Non-reactive" },
    { test_name: "Result", result: "5", unit: null, ref_low: null, ref_high: null, confidence: "low", source_line: "Result 5" },
  ],
  warnings: [],
  ...over,
});

beforeEach(() => {
  api.mockReset();
});

describe("applyScanToRecord", () => {
  const form = { record_type: "other" as const, title: "typed by me", record_date: "", provider_name: "", notes: "keep" };

  it("fills only what the scan found and leaves everything else alone", () => {
    const { next, filled } = applyScanToRecord(form, scan({ record: { record_type: null, title: null, record_date: "2026-11-12", date_ambiguous: false, provider_name: "Lab" } }), "2026-11-17");
    expect(next).toEqual({ ...form, record_date: "2026-11-12", provider_name: "Lab" });
    expect(filled).toEqual(["date", "doctor or lab"]);
  });

  it("never applies a future date", () => {
    const { next, filled } = applyScanToRecord(form, scan(), "2026-11-01");
    expect(next.record_date).toBe("");
    expect(filled).not.toContain("date");
  });

  it("describes what was filled in plain words", () => {
    expect(filledSummary([])).toBe("");
    expect(filledSummary(["title"])).toBe("title");
    expect(filledSummary(["type", "title", "date"])).toBe("type, title and date");
  });
});

describe("review rows", () => {
  it("starts low-confidence rows unticked and carries only what was read", () => {
    const rows = reviewRows(scan(), "2026-11-12");
    expect(rows.map((r) => r.include)).toEqual([true, true, false]);
    expect(rows[0]!.form).toMatchObject({ test_name: "Hemoglobin", result: "11.2", unit: "g/dL", ref_low: "12", ref_high: "15.5", observed_on: "2026-11-12" });
    expect(rows[1]!.form).toMatchObject({ result: "Non-reactive", unit: "", ref_low: "", ref_high: "" });
  });

  it("checks ticked rows only", () => {
    const rows = reviewRows(scan(), "2026-11-12");
    rows[0]!.form.test_name = "";
    rows[2]!.form.test_name = ""; // unticked: never checked
    const problems = reviewProblems(rows, "2026-11-12");
    expect([...problems.keys()]).toEqual([0]);
  });

  it("sends ticked rows in the single-form shape; text results carry no range", () => {
    const body = bulkLabsBody(reviewRows(scan(), "2026-11-12"), "2026-11-12", "rec-1");
    expect(body.record_id).toBe("rec-1");
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ test_name: "Hemoglobin", value_numeric: 11.2, value_text: null, unit: "g/dL", ref_low: 12, ref_high: 15.5, observed_on: "2026-11-12" });
    expect(body.items[1]).toMatchObject({ value_numeric: null, value_text: "Non-reactive", ref_low: null, ref_high: null });
  });

  it("requires a real, non-future test date", () => {
    expect(dateProblem("")).toMatch(/choose/i);
    expect(dateProblem("2026-12-01", "2026-11-17")).toMatch(/future/i);
    expect(dateProblem("2026-11-12", "2026-11-17")).toBeNull();
  });
});

describe("cameraErrorMessage", () => {
  it("explains a blocked camera and an absent one in plain words", () => {
    expect(cameraErrorMessage(new DOMException("x", "NotAllowedError"))).toMatch(/blocked/i);
    expect(cameraErrorMessage(new DOMException("x", "NotFoundError"))).toMatch(/no camera/i);
    expect(cameraErrorMessage(new Error("boom"))).toMatch(/couldn’t be started/);
  });
});

describe("ScanCapture", () => {
  it("shows nothing when this server cannot scan", async () => {
    api.mockResolvedValue({ available: false, photos: false, pdf_text: false, scanned_pdf: false });
    const { container } = render(<ScanCapture onScanned={vi.fn()} />);
    await waitFor(() => expect(api).toHaveBeenCalledWith("/records/scan/status"));
    expect(container).toBeEmptyDOMElement();
  });

  it("offers a PDF upload only when photos cannot be read", async () => {
    api.mockResolvedValue({ available: true, photos: false, pdf_text: true, scanned_pdf: false });
    render(<ScanCapture onScanned={vi.fn()} />);
    expect(await screen.findByRole("button", { name: /upload a pdf/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take a photo/i })).not.toBeInTheDocument();
  });

  it("sends the chosen file to the scan endpoint and hands back the draft with the same file", async () => {
    const result = scan();
    api.mockImplementation((path: string) => (path === "/records/scan/status" ? Promise.resolve({ available: true, photos: true, pdf_text: true, scanned_pdf: true }) : Promise.resolve(result)));
    const onScanned = vi.fn();
    render(<ScanCapture onScanned={onScanned} />);
    await screen.findByRole("button", { name: /take a photo/i });
    const file = new File(["x"], "report.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Choose a photo or PDF to scan"), file);
    await waitFor(() => expect(onScanned).toHaveBeenCalledWith(file, result));
    const call = api.mock.calls.find((c) => c[0] === "/records/scan")!;
    expect(call[1].method).toBe("POST");
    expect(call[1].body).toBeInstanceOf(FormData);
  });

  it("says why a scan failed and keeps nothing", async () => {
    api.mockImplementation((path: string) =>
      path === "/records/scan/status"
        ? Promise.resolve({ available: true, photos: true, pdf_text: true, scanned_pdf: true })
        : Promise.reject(new ApiError(422, "IMAGE_UNREADABLE", "This image could not be opened.", [])),
    );
    const onScanned = vi.fn();
    render(<ScanCapture onScanned={onScanned} />);
    await screen.findByRole("button", { name: /take a photo/i });
    await userEvent.upload(screen.getByLabelText("Choose a photo or PDF to scan"), new File(["x"], "bad.png", { type: "image/png" }));
    expect(await screen.findByText("This image could not be opened.")).toBeInTheDocument();
    expect(onScanned).not.toHaveBeenCalled();
  });

  it("rejects an unsupported file before sending it", async () => {
    api.mockResolvedValue({ available: true, photos: true, pdf_text: true, scanned_pdf: true });
    render(<ScanCapture onScanned={vi.fn()} />);
    await screen.findByRole("button", { name: /take a photo/i });
    await userEvent.upload(screen.getByLabelText("Choose a photo or PDF to scan"), new File(["x"], "a.html", { type: "text/html" }), { applyAccept: false });
    expect(await screen.findByText(/PDF, PNG or JPEG/)).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1); // only the status call
  });
});

describe("LabImport", () => {
  it("saves only ticked rows, linked to the existing record, and reports them", async () => {
    api.mockResolvedValue([{ id: "1", test_name: "Hemoglobin" }, { id: "2", test_name: "HIV 1 & 2" }]);
    const onDone = vi.fn();
    render(<LabImport scan={scan()} file={null} recordId="rec-9" onDone={onDone} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /save 2 results/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [path, opts] = api.mock.calls[0]!;
    expect(path).toBe("/labs/bulk");
    expect(opts.body.record_id).toBe("rec-9");
    expect(opts.body.items.map((i: { test_name: string }) => i.test_name)).toEqual(["Hemoglobin", "HIV 1 & 2"]);
  });

  it("will not save without a test date and says so", async () => {
    const noDate = scan({ record: { ...scan().record, record_date: null } });
    render(<LabImport scan={noDate} file={null} recordId="rec-9" onDone={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /save 2 results/i }));
    expect(await screen.findByText("Choose the test date.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("creates the record, attaches the file, then saves the results linked to it", async () => {
    api.mockImplementation((path: string) => {
      if (path === "/records") return Promise.resolve({ id: "new-rec" });
      if (path === "/records/new-rec/file") return Promise.resolve({ id: "new-rec" });
      return Promise.resolve([{ id: "1", test_name: "Hemoglobin" }]);
    });
    const onDone = vi.fn();
    render(<LabImport scan={scan()} file={new File(["x"], "r.png", { type: "image/png" })} onDone={onDone} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /save 2 results/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.mock.calls.map((c) => c[0])).toEqual(["/records", "/records/new-rec/file", "/labs/bulk"]);
    expect(api.mock.calls[2]![1].body.record_id).toBe("new-rec");
  });

  it("says so when the report was kept but the results were not saved", async () => {
    api.mockImplementation((path: string) => {
      if (path === "/records") return Promise.resolve({ id: "new-rec" });
      if (path === "/records/new-rec/file") return Promise.resolve({ id: "new-rec" });
      return Promise.reject(new ApiError(409, "LIMIT_REACHED", "You can save up to 2000 results.", []));
    });
    const onDone = vi.fn();
    render(<LabImport scan={scan()} file={new File(["x"], "r.png", { type: "image/png" })} onDone={onDone} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /save 2 results/i }));
    expect(await screen.findByText(/report was saved in Records, but the results weren’t saved/)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("explains an empty scan instead of showing an empty table", () => {
    render(<LabImport scan={scan({ labs: [] })} file={null} recordId="r" onDone={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("No results were found")).toBeInTheDocument();
  });
});
