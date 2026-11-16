import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateShareCard } from "@/components/sharing/CreateShareCard";
import { SharedSummaryView } from "@/components/sharing/SharedSummaryView";
import type { SharedSummary } from "@/lib/sharing";

const api = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  api: (...args: unknown[]) => api(...args),
}));

const summary = (over: Partial<SharedSummary> = {}): SharedSummary => ({
  generated_at: "2026-11-16T10:00:00Z",
  categories: ["allergies"],
  date_from: null,
  date_to: null,
  profile: null,
  conditions: null,
  allergies: [{ substance: "Penicillin", reaction: "Rash", severity: "severe", verification_status: "patient_reported" }],
  medications: null,
  labs: null,
  records: null,
  limitations: ["This is a selection chosen by the patient. It is not a complete medical record."],
  ...over,
});

beforeEach(() => api.mockReset());

describe("SharedSummaryView", () => {
  it("shows only the shared sections, with provenance and the limitations", () => {
    render(<SharedSummaryView summary={summary()} />);
    expect(screen.getByText("Penicillin")).toBeInTheDocument();
    expect(screen.getByText("Patient reported")).toBeInTheDocument();
    expect(screen.getByText(/not a complete medical record/)).toBeInTheDocument();
    expect(screen.queryByText("Conditions")).not.toBeInTheDocument();
    expect(screen.queryByText("Lab results")).not.toBeInTheDocument();
  });

  it("labels lab flags against the report range", () => {
    const labs = [{ test_name: "Hemoglobin", value_numeric: 11.2, value_text: null, unit: "g/dL", ref_low: 12, ref_high: 15.5, flag: "low" as const, observed_on: "2026-11-01", verification_status: "patient_reported" as const }];
    render(<SharedSummaryView summary={summary({ labs, allergies: null })} />);
    expect(screen.getByText(/Below report range/)).toBeInTheDocument();
    expect(screen.queryByText(/abnormal/i)).not.toBeInTheDocument();
  });
});

describe("CreateShareCard", () => {
  async function fill() {
    await userEvent.type(screen.getByLabelText("Recipient's name"), "Dr Rao");
    await userEvent.type(screen.getByLabelText(/Recipient's email/), "dr.rao@example.com");
    await userEvent.click(screen.getByLabelText(/^Allergies/));
  }

  it("cannot share until the exact selection has been previewed and confirmed", async () => {
    api.mockResolvedValueOnce(summary());
    render(<CreateShareCard onCreated={() => {}} />);
    await fill();
    const share = screen.getByRole("button", { name: "Share now" });
    expect(share).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Preview what they will see" }));
    expect(await screen.findByText("Penicillin")).toBeInTheDocument();
    expect(share).toBeDisabled(); // previewed, but not yet confirmed
    await userEvent.click(screen.getByLabelText(/I have checked the preview/));
    expect(share).toBeEnabled();
    // Changing the selection invalidates the preview and the confirmation.
    await userEvent.click(screen.getByLabelText(/^Conditions/));
    expect(share).toBeDisabled();
    expect(screen.getByText("Preview again before you share.")).toBeInTheDocument();
  });

  it("sends the explicit confirmation and shows the link once", async () => {
    const onCreated = vi.fn();
    api.mockResolvedValueOnce(summary()).mockResolvedValueOnce({
      share: { recipient_name: "Dr Rao" },
      link: "http://localhost:3000/shared#abc",
      notification_sent: true,
    });
    render(<CreateShareCard onCreated={onCreated} />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Preview what they will see" }));
    await screen.findByText("Penicillin");
    await userEvent.click(screen.getByLabelText(/I have checked the preview/));
    await userEvent.click(screen.getByRole("button", { name: "Share now" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const [path, options] = api.mock.calls[1] as [string, { body: Record<string, unknown> }];
    expect(path).toBe("/shares");
    expect(options.body).toMatchObject({ confirm: true, categories: ["allergies"], recipient_email: "dr.rao@example.com" });
    expect(await screen.findByText("http://localhost:3000/shared#abc")).toBeInTheDocument();
    expect(screen.getByText("This link is shown only once.")).toBeInTheDocument();
  });

  it("asks for at least one category before previewing", async () => {
    render(<CreateShareCard onCreated={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Preview what they will see" }));
    expect(await screen.findByText("Choose at least one thing to share.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });
});
