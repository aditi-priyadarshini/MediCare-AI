import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiSafetyPanel } from "@/components/safety/AiSafetyPanel";
import { Composer } from "@/components/assistant/Composer";
import { modeBadge } from "@/lib/assistant";
import { splitAnswer, splitLabel, type AiSafetyAnswer } from "@/lib/safety-ai";

const api = vi.fn();
vi.mock("@/lib/api-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/api-client")>()),
  api: (...a: unknown[]) => api(...a),
}));

const answer = (over: Partial<AiSafetyAnswer> = {}): AiSafetyAnswer => ({
  mode: "drug_drug",
  answer: "Verdict: Serious. Bleeding risk goes up.\nWhat it means: Both thin the blood.\nRed flags: Black stools.",
  records_used: false,
  image_used: false,
  note: null,
  disclaimer: "Prototype note: AI-generated and can be wrong.",
  provider: "scripted",
  model: "m",
  ...over,
});

beforeEach(() => api.mockReset());

describe("answer parsing", () => {
  it("pulls the verdict out and picks a tone", () => {
    const r = splitAnswer("Verdict: Serious. Bleeding.\nWhat it means: x");
    expect(r.verdict).toBe("Serious. Bleeding.");
    expect(r.tone).toBe("danger");
    expect(splitAnswer("Verdict: Moderate").tone).toBe("warning");
    expect(splitAnswer("Verdict: No known interaction").tone).toBe("info");
    expect(splitAnswer("Just text").verdict).toBeNull();
  });
  it("splits a short label from its text", () => {
    expect(splitLabel("What it means: Both thin the blood.")).toEqual({ label: "What it means", body: "Both thin the blood." });
    expect(splitLabel("no label here").label).toBeNull();
  });
});

describe("assistant badge", () => {
  it("shows the open-mode badge", () => {
    expect(modeBadge({ mode: "open", evidence: [] })?.key).toBe("assistant.mode.open");
  });
});

describe("AiSafetyPanel (two medicines)", () => {
  it("needs two medicines before it can ask", async () => {
    render(<AiSafetyPanel mode="drug_drug" />);
    const ask = screen.getByRole("button", { name: "Ask the AI" });
    expect(ask).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Medicine 1"), "warfarin");
    expect(ask).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Medicine 2"), "aspirin");
    expect(ask).toBeEnabled();
  });

  it("sends both names to the AI, shows the answer, and can try again", async () => {
    api.mockResolvedValue(answer());
    render(<AiSafetyPanel mode="drug_drug" />);
    await userEvent.type(screen.getByLabelText("Medicine 1"), "warfarin");
    await userEvent.type(screen.getByLabelText("Medicine 2"), "aspirin");
    await userEvent.click(screen.getByRole("button", { name: "Ask the AI" }));

    expect(await screen.findByText(/Both thin the blood/)).toBeInTheDocument();
    const [path, opts] = api.mock.calls[0]!;
    expect(path).toBe("/safety/ai/ask");
    const form = (opts as { body: FormData }).body;
    expect(form.get("mode")).toBe("drug_drug");
    expect(JSON.parse(String(form.get("drugs")))).toEqual(["warfarin", "aspirin"]);

    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  });

  it("can add a third medicine", async () => {
    render(<AiSafetyPanel mode="drug_drug" />);
    await userEvent.click(screen.getByRole("button", { name: /Add another medicine/ }));
    expect(screen.getByLabelText("Medicine 3")).toBeInTheDocument();
  });

  it("shows a retry when the AI does not answer", async () => {
    api.mockRejectedValueOnce(new Error("x"));
    render(<AiSafetyPanel mode="medicine" />);
    await userEvent.type(screen.getByLabelText("Medicine"), "ibuprofen");
    await userEvent.click(screen.getByRole("button", { name: "Ask the AI" }));
    expect(await screen.findByText("The AI did not answer")).toBeInTheDocument();
    api.mockResolvedValueOnce(answer({ mode: "medicine" }));
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText(/Both thin the blood/)).toBeInTheDocument();
  });

  it("runs by itself for the medicine review", async () => {
    api.mockResolvedValue(answer({ mode: "my_medicines", records_used: true }));
    render(<AiSafetyPanel mode="my_medicines" autoRun />);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Used your medicines/)).toBeInTheDocument();
  });
});

describe("Composer photo buttons", () => {
  const base = {
    value: "",
    onChange: () => undefined,
    onSend: vi.fn(),
    busy: false,
    sending: false,
    context: { medicines: false, history: false, labs: false, doses: false, allergies: false },
    language: "en" as const,
    voiceOn: false,
    showPrompts: false,
    easy: false,
  };

  it("offers take and upload photo in open mode only", () => {
    const { rerender } = render(<Composer {...base} />);
    expect(screen.queryByRole("button", { name: /Take photo/ })).toBeNull();
    rerender(<Composer {...base} openMode image={null} onImage={() => undefined} />);
    expect(screen.getByRole("button", { name: /Take photo/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload photo/ })).toBeInTheDocument();
  });

  it("lets you send a picture with no text", () => {
    const file = new File(["x"], "p.jpg", { type: "image/jpeg" });
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    render(<Composer {...base} openMode image={file} onImage={() => undefined} />);
    expect(screen.getByRole("button", { name: /Send/ })).toBeEnabled();
    vi.unstubAllGlobals();
  });
});
