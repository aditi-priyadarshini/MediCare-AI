import { describe, expect, it } from "vitest";
import { blocked, foodsProblem, splitFoods, visibleFlags, type DietFlag } from "@/lib/diet";

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
