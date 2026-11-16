import { describe, expect, it } from "vitest";
import { EMERGENCY_NUMBER, FLOW, STEP_LABEL, coordsText, telFor } from "@/lib/emergency";
import { flagText, isSixDigits, labValue, rangeText, scopeKey, timeLeft, tokenFromHash } from "@/lib/sharing";

describe("tokenFromHash", () => {
  it("reads a well-formed fragment and ignores anything else", () => {
    const t = "Ab1_-".repeat(9);
    expect(tokenFromHash(`#${t}`)).toBe(t);
    expect(tokenFromHash(t)).toBe(t);
    expect(tokenFromHash("")).toBeNull();
    expect(tokenFromHash("#short")).toBeNull();
    expect(tokenFromHash("#/path?x=1")).toBeNull();
    expect(tokenFromHash(`#${"a".repeat(201)}`)).toBeNull();
  });
});

describe("scopeKey", () => {
  it("ignores order but notices any change to the selection", () => {
    expect(scopeKey(["labs", "allergies"], "", "")).toBe(scopeKey(["allergies", "labs"], "", ""));
    expect(scopeKey(["labs"], "", "")).not.toBe(scopeKey(["labs", "records"], "", ""));
    expect(scopeKey(["labs"], "2026-01-01", "")).not.toBe(scopeKey(["labs"], "", ""));
  });
});

describe("wording", () => {
  it("compares with the report range and never says abnormal", () => {
    expect(flagText("high")).toBe("Above report range");
    expect(flagText("low")).toBe("Below report range");
    expect(flagText("unknown")).toBe("No range on the report");
    for (const f of ["low", "normal", "high", "unknown"] as const) expect(flagText(f)).not.toMatch(/abnormal/i);
  });
  it("formats values, ranges and time left", () => {
    expect(labValue({ value_numeric: 11.2, value_text: null, unit: "g/dL" })).toBe("11.2 g/dL");
    expect(labValue({ value_numeric: null, value_text: "Positive", unit: null })).toBe("Positive");
    expect(rangeText(null, null)).toBeNull();
    expect(rangeText("2026-01-01", null)).toBe("Dated from 2026-01-01");
    const now = new Date("2026-11-16T10:00:00Z");
    expect(timeLeft("2026-11-16T09:59:00Z", now)).toBe("Ended");
    expect(timeLeft("2026-11-16T10:30:00Z", now)).toBe("30 min left");
    expect(timeLeft("2026-11-17T10:00:00Z", now)).toBe("24 h left");
    expect(timeLeft("2026-11-26T10:00:00Z", now)).toBe("10 days left");
  });
  it("accepts only a 6-digit code", () => {
    expect(isSixDigits("123456")).toBe(true);
    expect(isSixDigits(" 123456 ")).toBe(true);
    expect(isSixDigits("12345")).toBe(false);
    expect(isSixDigits("12a456")).toBe(false);
  });
});

describe("emergency helpers", () => {
  it("every practice step says it is practice, and the flow ends at arrival", () => {
    for (const step of FLOW.slice(1)) expect(STEP_LABEL[step]).toMatch(/^Practice/);
    expect(STEP_LABEL.requested).toMatch(/Practice/);
    expect(STEP_LABEL.cancelled).toMatch(/Practice/);
    expect(FLOW).toEqual(["requested", "acknowledged", "en_route", "arrived"]);
  });
  it("builds call links and coordinates text", () => {
    expect(EMERGENCY_NUMBER).toBe("112");
    expect(telFor("+919876543210")).toBe("tel:+919876543210");
    expect(telFor("12")).toBeNull();
    expect(coordsText(20.296123456, 85.824512345)).toBe("20.29612, 85.82451");
  });
});
