import { describe, expect, it } from "vitest";
import {
  AUTH_TEXT,
  bySeverity,
  CHECKS,
  formatMoney,
  outcomeText,
  parseList,
  priceAge,
  priceLine,
  SEVERITY_LABEL,
  sourceLine,
} from "@/lib/safety";
import type { Price, SafetyFinding } from "@/lib/types";

const finding = (severity: SafetyFinding["severity"]): SafetyFinding => ({
  rule_id: severity,
  kind: "drug_drug",
  severity,
  description: "d",
  clinical_significance: null,
  guidance: null,
  source: { name: "S", version: "1", reviewed_at: "2026-11-01", jurisdiction: "IN" },
  medication_ids: [],
  medication_names: [],
  ingredient_names: [],
  matched_term: null,
  conflict: false,
});

describe("outcome wording", () => {
  it("never says safe or clear for any outcome", () => {
    for (const o of ["findings", "no_matching_record", "insufficient_data"] as const) {
      const t = outcomeText(o, 2);
      const text = `${t.title} ${t.body}`;
      expect(text).not.toMatch(/\bsafe\b|all clear|no risk|success/i);
      expect(t.tone).not.toBe("success");
    }
  });
  it("pluralises findings", () => {
    expect(outcomeText("findings", 1).title).toBe("1 note to discuss");
    expect(outcomeText("findings", 3).title).toBe("3 notes to discuss");
  });
  it("says a no-match is not a clearance", () => {
    expect(outcomeText("no_matching_record", 0).body).toMatch(/not the same as being cleared/);
  });
});

describe("findings", () => {
  it("sorts most severe first and does not mutate the input", () => {
    const input = [finding("minor"), finding("contraindicated"), finding("unknown"), finding("major")];
    expect(bySeverity(input).map((f) => f.severity)).toEqual(["contraindicated", "major", "minor", "unknown"]);
    expect(input[0]!.severity).toBe("minor");
  });
  it("labels unknown severity honestly", () => {
    expect(SEVERITY_LABEL.unknown).toBe("Severity not established");
  });
  it("shows full source metadata", () => {
    expect(sourceLine(finding("minor").source)).toBe("S · version 1 · reviewed 2026-11-01 · IN");
  });
});

describe("helpers", () => {
  it("parses comma lists", () => {
    expect(parseList(" grapefruit, milk ,, grapefruit ,  green   tea ")).toEqual(["grapefruit", "milk", "green tea"]);
    expect(parseList("")).toEqual([]);
  });
  it("covers the four server checks", () => {
    expect(CHECKS.map((c) => c.name)).toEqual(["drug-drug", "drug-condition", "drug-food", "allergy"]);
  });
  it("never reports unable_to_verify as verified", () => {
    expect(AUTH_TEXT.unable_to_verify).toBe("Unable to verify");
    expect(AUTH_TEXT.verified).toMatch(/authoritative/);
  });
});

describe("prices", () => {
  const price: Price = {
    source_name: "City Pharmacy",
    price: "30.00",
    currency: "INR",
    pack_quantity: "10.00",
    pack_unit: "tablet",
    unit_price: "3.0000",
    jurisdiction: "IN",
    observed_at: "2026-11-12T00:00:00Z",
    age_days: 3,
    stale: false,
  };
  it("formats money and falls back on a bad currency", () => {
    expect(formatMoney("30", "INR")).toMatch(/30\.00/);
    expect(formatMoney("30", "???")).toBe("30.00 ???");
  });
  it("shows pack size and unit price together", () => {
    const line = priceLine(price);
    expect(line).toMatch(/for 10 tablet/);
    expect(line).toMatch(/per tablet/);
  });
  it("warns when a price is stale", () => {
    expect(priceAge({ age_days: 3, stale: false })).toBe("Seen 3 days ago.");
    expect(priceAge({ age_days: 0, stale: false })).toBe("Seen today.");
    expect(priceAge({ age_days: 200, stale: true })).toMatch(/out of date/);
  });
});
