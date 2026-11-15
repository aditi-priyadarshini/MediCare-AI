import { describe, expect, it } from "vitest";
import { isE164, isSixDigitCode, passwordProblem, toE164 } from "@/lib/validation";

describe("passwordProblem (mirrors backend rules)", () => {
  it("accepts a long passphrase", () => {
    expect(passwordProblem("correct-horse-battery-staple", "a@b.com")).toBeNull();
  });
  it.each([
    ["short", "at least 10"],
    ["1234567890123", "too simple"],
    ["aaaaaaaaaaaa", "too simple"],
  ])("rejects %s", (pw, fragment) => {
    expect(passwordProblem(pw)).toContain(fragment);
  });
  it("rejects a password equal to the email, case-insensitively", () => {
    expect(passwordProblem("User@Example.com", "user@example.com")).toMatch(/email/);
  });
});

describe("phone numbers", () => {
  it("normalises Indian numbers to E.164", () => {
    expect(toE164("98765 43210")).toBe("+919876543210");
    expect(toE164("09876543210")).toBe("+919876543210");
    expect(toE164("+44 7700 900123")).toBe("+447700900123");
  });
  it("validates E.164", () => {
    expect(isE164("+919876543210")).toBe(true);
    expect(isE164("9876543210")).toBe(false);
    expect(isE164("+0123456789")).toBe(false);
  });
});

it("validates 6-digit codes", () => {
  expect(isSixDigitCode("123456")).toBe(true);
  expect(isSixDigitCode("12345")).toBe(false);
  expect(isSixDigitCode("12a456")).toBe(false);
});
