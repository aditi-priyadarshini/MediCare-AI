import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiGenericsCard } from "@/components/safety/AiGenericsCard";
import { AiReviewCard } from "@/components/safety/AiReviewCard";
import { estimateLine, groupIssues, reviewStatusText } from "@/lib/safety";
import type { AiAlternatives, AiReview, ReviewIssue } from "@/lib/types";

const api = vi.fn();
vi.mock("@/lib/api-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/api-client")>()),
  api: (...a: unknown[]) => api(...a),
}));

const issue = (over: Partial<ReviewIssue> = {}): ReviewIssue => ({
  origin: "ai",
  section: "drug_condition",
  severity: "major",
  title: "Propranolol · Asthma",
  detail: "May worsen asthma.",
  guidance: "Ask a pharmacist or your prescriber about this.",
  source: null,
  medication_names: ["Propranolol"],
  ...over,
});

const review = (over: Partial<AiReview> = {}): AiReview => ({
  mode: "ai",
  message: "The AI reviewed every medicine and pair.",
  status: "needs_attention",
  counts: { needs_attention: 1, review: 1 },
  issues: [
    issue(),
    issue({
      origin: "reference",
      section: "drug_drug",
      severity: "moderate",
      title: "Ibuprofen + Aspirin",
      detail: "drug_drug note",
      source: "Test dataset (version t1, reviewed 2026-11-01)",
    }),
  ],
  medicines: [
    {
      name: "Propranolol",
      candidate: false,
      ai_recognised: true,
      effects: [
        { effect: "Slow heart rate", frequency: "common", serious: true, origin: "ai", source: null },
        { effect: "Tiredness", frequency: "very_common", serious: false, origin: "ai", source: null },
      ],
    },
  ],
  unrecognised: [],
  coverage: { medicines: 1, pairs: 1, conditions: 1, allergies: 0, foods: 0 },
  context: { medications: 2, conditions: 1, allergies: 0, foods: null, age_group: true },
  notes: ["No allergies are recorded. That means unknown, not that you have none."],
  ai_label: "AI-generated from general medical knowledge. Not reviewed by a clinician.",
  help_text: "Contact a doctor or pharmacist if you notice any of these. Call 112 for severe symptoms.",
  disclaimer: "None reported does not mean safe for you.",
  ...over,
});

describe("AiReviewCard", () => {
  beforeEach(() => {
    api.mockReset();
    window.history.replaceState({}, "", "/");
  });

  it("does nothing until the button is pressed, then labels AI and reference results apart", async () => {
    api.mockResolvedValue(review());
    render(<AiReviewCard />);
    expect(api).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Run the review" }));
    expect(api).toHaveBeenCalledWith("/safety/ai-review", { method: "POST", body: {} });
    expect(await screen.findByText("Propranolol · Asthma")).toBeInTheDocument();
    expect(screen.getAllByText("AI-generated").length).toBeGreaterThan(0);
    expect(screen.getByText("Reference data")).toBeInTheDocument();
    expect(screen.getByText(/Source: Test dataset/)).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
  });

  it("sends the typed foods and candidate medicine", async () => {
    api.mockResolvedValue(review());
    render(<AiReviewCard />);
    await userEvent.type(screen.getByLabelText(/Foods or drinks/), "grapefruit, alcohol, grapefruit");
    await userEvent.type(screen.getByLabelText(/Thinking of starting/), "Ibuprofen");
    await userEvent.click(screen.getByRole("button", { name: "Run the review" }));
    expect(api).toHaveBeenCalledWith("/safety/ai-review", {
      method: "POST",
      body: { foods: ["grapefruit", "alcohol"], candidate_name: "Ibuprofen" },
    });
  });

  it("starts by itself when the address has run=1", async () => {
    window.history.replaceState({}, "", "/safety/medicines?run=1");
    api.mockResolvedValue(review());
    render(<AiReviewCard />);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  });

  it("shows side effects with the fixed help text, serious ones flagged", async () => {
    api.mockResolvedValue(review());
    render(<AiReviewCard />);
    await userEvent.click(screen.getByRole("button", { name: "Run the review" }));
    expect(await screen.findByText(/Side effects of Propranolol/)).toBeInTheDocument();
    expect(screen.getByText("1 can be serious")).toBeInTheDocument();
    expect(screen.getByText(/Call 112/)).toBeInTheDocument();
  });

  it("never says safe, clear or success, even when nothing is reported", async () => {
    api.mockResolvedValue(
      review({ status: "no_matching_record", counts: { needs_attention: 0, review: 0 }, issues: [], medicines: [], notes: [] }),
    );
    const { container } = render(<AiReviewCard />);
    await userEvent.click(screen.getByRole("button", { name: "Run the review" }));
    expect(await screen.findByText("Nothing reported")).toBeInTheDocument();
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).toContain("not the same as being cleared");
    expect(text).not.toMatch(/\ball clear\b|\bsuccess\b|\bno risk\b|\bis safe\b/);
  });

  it("warns when the AI could not run and still shows what was found", async () => {
    api.mockResolvedValue(review({ mode: "consent_required", message: "Allow AI use in Settings to review all factors." }));
    render(<AiReviewCard />);
    await userEvent.click(screen.getByRole("button", { name: "Run the review" }));
    expect(await screen.findByText("Please note")).toBeInTheDocument();
    expect(screen.getByText(/Allow AI use in Settings/)).toBeInTheDocument();
    expect(screen.getByText("Ibuprofen + Aspirin")).toBeInTheDocument();
  });

  it("lists medicines the AI did not recognise", async () => {
    api.mockResolvedValue(review({ unrecognised: ["Zzyzx Forte"] }));
    render(<AiReviewCard />);
    await userEvent.click(screen.getByRole("button", { name: "Run the review" }));
    expect(await screen.findByText(/Zzyzx Forte/)).toBeInTheDocument();
  });

  it("shows an error instead of a result when the request fails", async () => {
    api.mockRejectedValue(new Error("boom"));
    render(<AiReviewCard />);
    await userEvent.click(screen.getByRole("button", { name: "Run the review" }));
    expect(await screen.findByText("The review did not run")).toBeInTheDocument();
  });
});

describe("review helpers", () => {
  it("groups issues by section in a fixed order and keeps severity order inside a group", () => {
    const groups = groupIssues([
      issue({ section: "age", title: "a" }),
      issue({ section: "allergy", title: "b" }),
      issue({ section: "allergy", title: "c" }),
    ]);
    expect(groups.map((g) => g.section)).toEqual(["allergy", "age"]);
    expect(groups[0]!.items.map((i) => i.title)).toEqual(["b", "c"]);
  });

  it("uses the shared wording for serious statuses", () => {
    expect(reviewStatusText("needs_attention", { needs_attention: 2, review: 0 }).title).toBe("Needs attention");
  });
});

/* ----------------------------------------------------------------------------- generics */
const alternatives = (over: Partial<AiAlternatives> = {}): AiAlternatives => ({
  mode: "ai",
  message: "The AI looked up all 1 medicines.",
  medicines: [
    {
      name: "Glycomet",
      medication_id: "m1",
      status: "found",
      generic_name: "metformin",
      is_brand: true,
      ingredients: ["metformin"],
      strength: "500 mg",
      form: "tablet",
      own_price: { low: "30.00", high: "60.00", currency: "INR", pack_quantity: 10, pack_unit: "tablet", unit_low: "3.00", unit_high: "6.00", basis: "ai_estimate" },
      alternatives: [
        {
          name: "Metformin",
          kind: "generic",
          strength: "500 mg",
          form: "tablet",
          price: { low: "12.50", high: "25.00", currency: "INR", pack_quantity: 10, pack_unit: "tablet", unit_low: "1.25", unit_high: "2.50", basis: "ai_estimate" },
          differences: [],
        },
        { name: "Glucophage", kind: "brand", strength: null, form: null, price: null, differences: ["Strength not confirmed"] },
      ],
      reference: null,
    },
  ],
  ai_label: "Found by an AI from general knowledge of medicines sold in India.",
  price_notice: "Prices marked as an AI estimate are rough guesses in rupees, not quotes.",
  notice: "These are candidates, not substitutes.",
  ...over,
});

const first = (a: AiAlternatives = alternatives()) => a.medicines[0]!;

describe("AiGenericsCard", () => {
  beforeEach(() => api.mockReset());

  it("looks up the whole list by default and labels every AI price as an estimate", async () => {
    api.mockResolvedValue(alternatives());
    render(<AiGenericsCard />);
    await userEvent.click(screen.getByRole("button", { name: "Look up my medicines" }));
    expect(api).toHaveBeenCalledWith("/safety/ai-alternatives", { method: "POST", body: {} });
    expect(await screen.findByText("Glucophage")).toBeInTheDocument();
    expect(screen.getAllByText("AI estimate")).toHaveLength(2); // own price + the generic's
    expect(screen.getByText("Generic")).toBeInTheDocument();
    expect(screen.getByText(/not quotes/)).toBeInTheDocument();
    expect(screen.getByText(/Strength not confirmed/)).toBeInTheDocument();
    expect(screen.getByText("No price estimate.")).toBeInTheDocument();
  });

  it("looks up one typed medicine with its strength", async () => {
    api.mockResolvedValue(alternatives());
    render(<AiGenericsCard />);
    await userEvent.type(screen.getByLabelText(/A single medicine/), "Glycomet");
    await userEvent.type(screen.getByLabelText(/Strength/), "500 mg");
    await userEvent.click(screen.getByRole("button", { name: "Look up this medicine" }));
    expect(api).toHaveBeenCalledWith("/safety/ai-alternatives", {
      method: "POST",
      body: { medicine_name: "Glycomet", strength: "500 mg" },
    });
  });

  it("explains an unrecognised medicine instead of guessing", async () => {
    api.mockResolvedValue(
      alternatives({ medicines: [{ ...first(), status: "not_recognised", alternatives: [], own_price: null }] }),
    );
    render(<AiGenericsCard />);
    await userEvent.click(screen.getByRole("button", { name: "Look up my medicines" }));
    expect(await screen.findByText("Not recognised")).toBeInTheDocument();
  });

  it("keeps sourced catalogue prices apart from AI estimates", async () => {
    const base = first();
    api.mockResolvedValue(
      alternatives({
        mode: "partial",
        medicines: [
          {
            ...base,
            alternatives: [],
            status: "none_found",
            own_price: null,
            reference: {
              subject: {} as never,
              status: "candidates",
              missing: [],
              excluded_incomplete: 0,
              notice: "",
              price_notice: "",
              candidates: [
                {
                  differences: [],
                  label: "candidate" as const,
                  medicine: {
                    id: "c1",
                    name: "Ibuprofen",
                    form: "tablet",
                    strength_text: "400 mg",
                    route: "oral",
                    release_type: "immediate",
                    ingredients: [],
                    prices: [
                      { source_name: "Price list", price: "30", currency: "INR", pack_quantity: "10", pack_unit: "tablet", unit_price: "3", jurisdiction: "IN", observed_at: "2026-11-01T00:00:00Z", age_days: 17, stale: false },
                    ],
                  },
                },
              ],
            },
          },
        ],
      }),
    );
    render(<AiGenericsCard />);
    await userEvent.click(screen.getByRole("button", { name: "Look up my medicines" }));
    expect(await screen.findByText("From the reference catalogue")).toBeInTheDocument();
    expect(screen.getByText(/Price list · IN/)).toBeInTheDocument();
    expect(screen.queryByText("AI estimate")).not.toBeInTheDocument();
  });

  it("formats an estimate so it always reads as a guess", () => {
    const line = estimateLine({ low: "10.00", high: "20.00", currency: "INR", pack_quantity: 10, pack_unit: "tablet", unit_low: "1.00", unit_high: "2.00", basis: "ai_estimate" });
    expect(line.startsWith("About ")).toBe(true);
    expect(line).toContain("10 tablets");
  });
});
