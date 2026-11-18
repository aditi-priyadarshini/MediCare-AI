import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import { AiPairsCard } from "@/components/safety/AiPairsCard";
import { splitPairs } from "@/lib/safety";
import type { AiPair, AiPairsResult } from "@/lib/types";

const api = vi.fn();
vi.mock("@/lib/api-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/api-client")>()),
  api: (...a: unknown[]) => api(...a),
}));

const pair = (over: Partial<AiPair>): AiPair => ({
  medication_a: "Metformin",
  medication_b: "Amlodipine",
  state: "ai_note",
  curated: [],
  ai_severity: "moderate",
  ai_note: "May lower blood pressure further.",
  ...over,
});

const result = (over: Partial<AiPairsResult> = {}): AiPairsResult => ({
  mode: "ai",
  message: "The AI checked all 2 pairs.",
  medicines: 3,
  pairs: [
    pair({}),
    pair({
      medication_b: "Paracetamol",
      state: "ai_none_reported",
      ai_severity: "none_reported",
      ai_note: null,
    }),
  ],
  ai_label:
    "AI-generated from general medical knowledge. Not reviewed by a clinician.",
  disclaimer: "None reported does not mean safe together.",
  ...over,
});

describe("AiPairsCard", () => {
  beforeEach(() => {
    api.mockReset();
  });

  it("asks the AI only when the button is pressed and labels the answer as AI", async () => {
    api.mockResolvedValue(result());
    render(<AiPairsCard />);
    expect(api).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Check all pairs" }),
    );
    expect(api).toHaveBeenCalledWith("/safety/ai-pairs", {
      method: "POST",
      body: {},
    });
    expect(
      await screen.findByText("Metformin + Amlodipine"),
    ).toBeInTheDocument();
    expect(screen.getByText("AI: moderate")).toBeInTheDocument();
    expect(screen.getAllByText(/AI-generated/).length).toBeGreaterThan(0);
  });

  it("keeps 'none reported' pairs collapsed and never calls them safe", async () => {
    api.mockResolvedValue(result());
    render(<AiPairsCard />);
    await userEvent.click(
      screen.getByRole("button", { name: "Check all pairs" }),
    );
    expect(
      await screen.findByText(/1 pair with no interaction reported/),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not mean safe together/)).toBeInTheDocument();
  });

  it("shows why nothing was checked", async () => {
    api.mockResolvedValue(
      result({
        mode: "consent_required",
        message: "Allow AI use in Settings.",
        pairs: [],
      }),
    );
    render(<AiPairsCard />);
    await userEvent.click(
      screen.getByRole("button", { name: "Check all pairs" }),
    );
    expect(
      await screen.findByText("Allow AI use in Settings."),
    ).toBeInTheDocument();
  });

  it("shows a failed request", async () => {
    api.mockImplementation(async () => {
      throw new ApiError(500, "X", "Network down");
    });
    render(<AiPairsCard />);
    fireEvent.click(screen.getByRole("button", { name: "Check all pairs" }));
    expect(await screen.findByText("Network down")).toBeInTheDocument();
  });
});

describe("splitPairs", () => {
  it("puts findings and unchecked pairs first", () => {
    const { shown, quiet } = splitPairs([
      { state: "ai_note" },
      { state: "curated" },
      { state: "not_checked" },
      { state: "ai_none_reported" },
      { state: "ai_unsure" },
    ]);
    expect(shown).toHaveLength(3);
    expect(quiet).toHaveLength(2);
  });
});
