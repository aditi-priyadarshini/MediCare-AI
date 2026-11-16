import { describe, expect, it } from "vitest";
import { actionLabel, canReview, dayEndIso, dayStartIso, reviewLabel, type AdminRule } from "@/lib/admin";

const r = (over: Partial<AdminRule>) =>
  ({ status: "active", review_status: "unreviewed", created_by_user_id: "a", ...over }) as AdminRule;

describe("admin helpers", () => {
  it("only a different admin may review an active, unreviewed rule", () => {
    expect(canReview(r({}), "b")).toBe(true);
    expect(canReview(r({}), "a")).toBe(false); // the author
    expect(canReview(r({ review_status: "approved" }), "b")).toBe(false);
    expect(canReview(r({ status: "retired" }), "b")).toBe(false);
  });

  it("describes review state without implying clinical sign-off", () => {
    expect(reviewLabel(r({}))).toBe("Awaiting second-person review");
    expect(reviewLabel(r({ review_status: "approved" }))).toBe("Reviewed by a second administrator");
    expect(reviewLabel(r({ status: "retired" }))).toBe("Replaced or retired");
  });

  it("formats audit actions", () => {
    expect(actionLabel("admin.rule_create")).toBe("Rule create");
    expect(actionLabel("auth.login_failed")).toBe("Login failed");
    expect(actionLabel("plain")).toBe("Plain");
  });

  it("builds a half-open day range from a date input", () => {
    expect(dayStartIso("")).toBeUndefined();
    expect(dayEndIso("")).toBeUndefined();
    const start = new Date(dayStartIso("2026-11-16")!).getTime();
    const end = new Date(dayEndIso("2026-11-16")!).getTime();
    expect(end - start).toBeGreaterThanOrEqual(23 * 3600_000);
    expect(end - start).toBeLessThanOrEqual(25 * 3600_000); // DST days
  });
});
