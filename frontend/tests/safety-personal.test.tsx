import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EffectsPanel, IssueList, StatusBanner } from "@/components/safety/parts";
import {
  contextLine,
  EXPLAIN_MODE_TEXT,
  FREQUENCY_LABEL,
  sortEffects,
  splitEffects,
  statusText,
} from "@/lib/safety";
import type { AdverseEffect, SafetyIssue, SafetyStatus } from "@/lib/types";

const source = { name: "S", version: "1", reviewed_at: "2026-11-01", jurisdiction: "IN" };
const effect = (
  effect: string,
  frequency: AdverseEffect["frequency"],
  seriousness: AdverseEffect["seriousness"],
  help: string | null = null,
): AdverseEffect => ({ id: effect, ingredient_name: "Drug", effect, frequency, seriousness, when_to_get_help: help, source });

const STATUSES: SafetyStatus[] = ["needs_attention", "review", "no_matching_record", "insufficient_data"];

describe("status wording", () => {
  it("never says safe, clear or success for any status", () => {
    for (const s of STATUSES) {
      const t = statusText(s, { needs_attention: 2, review: 1 });
      expect(`${t.title} ${t.body}`).not.toMatch(/\bsafe\b|all clear|no risk|success/i);
    }
    for (const text of Object.values(EXPLAIN_MODE_TEXT)) expect(text).not.toMatch(/\bsafe\b/i);
  });
  it("uses a danger tone only for needs attention", () => {
    expect(statusText("needs_attention", { needs_attention: 1, review: 0 }).tone).toBe("danger");
    expect(statusText("review", { needs_attention: 0, review: 2 }).tone).toBe("warning");
    expect(statusText("no_matching_record", { needs_attention: 0, review: 0 }).tone).toBe("info");
  });
  it("pluralises counts", () => {
    expect(statusText("needs_attention", { needs_attention: 1, review: 0 }).body).toMatch(/^1 serious note for you/);
    expect(statusText("needs_attention", { needs_attention: 3, review: 1 }).body).toMatch(/^3 serious notes.*1 more note/);
  });
  it("says a no-match is not a clearance", () => {
    expect(statusText("no_matching_record", { needs_attention: 0, review: 0 }).body).toMatch(/not the same as being cleared/);
  });
  it("states how much of the person's data was used", () => {
    expect(contextLine({ medications: 1, conditions: 0, allergies: 2 })).toBe(
      "Based on 1 medicine, 0 health conditions and 2 allergies recorded for you.",
    );
  });
});

describe("effects", () => {
  const items = [effect("Nausea", "common", "mild"), effect("Rash", "rare", "serious", "Get help."), effect("Cough", "very_common", "mild")];
  it("sorts serious first, then most frequent, without mutating", () => {
    expect(sortEffects(items).map((e) => e.effect)).toEqual(["Rash", "Cough", "Nausea"]);
    expect(items[0]!.effect).toBe("Nausea");
  });
  it("splits serious from the rest", () => {
    const { serious, other } = splitEffects(items);
    expect(serious.map((e) => e.effect)).toEqual(["Rash"]);
    expect(other).toHaveLength(2);
  });
  it("labels unknown frequency honestly", () => {
    expect(FREQUENCY_LABEL.unknown).toBe("Frequency not established");
  });
});

describe("components", () => {
  it("shows the status banner with its context line", () => {
    render(
      <StatusBanner
        status="needs_attention"
        counts={{ needs_attention: 1, review: 0 }}
        context={{ medications: 2, conditions: 1, allergies: 0, foods: null }}
      />,
    );
    expect(screen.getByText("Needs attention")).toBeTruthy();
    expect(screen.getByText(/Based on 2 medicines/)).toBeTruthy();
  });
  it("shows serious effects with when to get help, others behind a disclosure", () => {
    render(<EffectsPanel effects={[effect("Rash", "rare", "serious", "Get urgent help."), effect("Nausea", "common", "mild")]} />);
    expect(screen.getByText("Get help quickly if you notice")).toBeTruthy();
    expect(screen.getByText("Get urgent help.")).toBeTruthy();
    expect(screen.getByText(/Other possible effects \(1\)/)).toBeTruthy();
  });
  it("says an empty effects list does not mean there are none", () => {
    render(<EffectsPanel effects={[]} />);
    expect(screen.getByText(/does not mean there are none/)).toBeTruthy();
  });
  it("lists issues with severity, section and source", () => {
    const issue: SafetyIssue = {
      section: "drug_condition",
      severity: "major",
      title: "Ibuprofen · Kidney disease",
      detail: "Can affect kidney function.",
      guidance: null,
      medication_names: ["Ibuprofen"],
      source,
    };
    render(<IssueList issues={[issue]} heading="What needs your attention" />);
    expect(screen.getByText("Major")).toBeTruthy();
    expect(screen.getByText("Health condition")).toBeTruthy();
    expect(screen.getByText(/Source: S · version 1/)).toBeTruthy();
  });
});
