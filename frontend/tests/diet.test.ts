import { describe, expect, it } from "vitest";
import { blocked, dayKey, foodsProblem, planDayLabel, planDayNumber, shortLabel, splitFoods, visibleFlags, type DietFlag } from "@/lib/diet";

describe("splitFoods", () => {
  it("splits on commas, semicolons and new lines, lower-cases and de-duplicates", () => {
    expect(splitFoods("Peanuts, brinjal;  MILK\nmilk ,, ")).toEqual(["peanuts", "brinjal", "milk"]);
    expect(splitFoods("  ")).toEqual([]);
  });
  it("collapses inner spaces", () => {
    expect(splitFoods("ground   nut")).toEqual(["ground nut"]);
  });
});

describe("foodsProblem", () => {
  it("mirrors the API limits", () => {
    expect(foodsProblem(["a"])).toBeNull();
    expect(foodsProblem(Array.from({ length: 21 }, (_, i) => `f${i}`))).toMatch(/20/);
    expect(foodsProblem(["x".repeat(41)])).toMatch(/40/);
  });
});

const flag = (code: string, severity: DietFlag["severity"]): DietFlag => ({ code, severity, message: code });

describe("flags", () => {
  it("finds a blocking flag", () => {
    expect(blocked([flag("a", "info"), flag("kidney_disease", "block")])?.code).toBe("kidney_disease");
    expect(blocked([flag("a", "review")])).toBeUndefined();
  });
  it("leaves the general note to the page notice", () => {
    expect(visibleFlags([flag("general_education", "info"), flag("pregnancy", "review")]).map((f) => f.code)).toEqual([
      "pregnancy",
    ]);
  });
});


describe("plan days", () => {
  it("numbers days from the day the plan was made", () => {
    const made = "2026-11-17T03:00:00Z";
    expect(planDayNumber(made, new Date("2026-11-17T20:00:00Z"), "UTC")).toBe(1);
    expect(planDayNumber(made, new Date("2026-11-18T01:00:00Z"), "UTC")).toBe(2);
    expect(planDayNumber(made, new Date("2026-11-24T01:00:00Z"), "UTC")).toBe(8); // past a 7-day plan
  });
  it("uses the person's time zone for 'today'", () => {
    // 20:00 UTC is already the next day in India (UTC+5:30).
    expect(dayKey(new Date("2026-11-17T20:00:00Z"), "Asia/Kolkata")).toBe("2026-11-18");
    expect(planDayNumber("2026-11-17T03:00:00Z", new Date("2026-11-17T20:00:00Z"), "Asia/Kolkata")).toBe(2);
  });
  it("labels each day with its weekday and date", () => {
    const l = planDayLabel("2026-11-17T03:00:00Z", 3, "UTC");
    expect(l.weekday).toBe("Thu");
    expect(l.date).toMatch(/19 Nov/);
  });
  it("shortens a diet label", () => {
    expect(shortLabel("Vegetarian (no egg, fish or meat)")).toBe("Vegetarian");
    expect(shortLabel("No restriction")).toBe("No restriction");
  });
});
