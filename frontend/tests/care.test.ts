import { describe, expect, it } from "vitest";
import {
  bookingRange,
  capitalise,
  distanceLabel,
  formatDate,
  osmLink,
  priceText,
  queryString,
  stockHeadline,
  telHref,
  CAN_CANCEL,
  STATUS_BADGE,
  type Stock,
} from "@/lib/care";

const stock = (over: Partial<Stock> = {}): Stock => ({
  state: "reported",
  reported: "in_stock",
  price_amount: null,
  currency: null,
  pack_size_text: null,
  source_name: "Test feed",
  source_timestamp: "2026-11-15T10:00:00Z",
  freshness: null,
  call_to_confirm: false,
  message: "",
  ...over,
});

describe("queryString", () => {
  it("drops empty values and encodes the rest", () => {
    expect(queryString({ q: "", city: undefined, a: null, v: false })).toBe("");
    expect(queryString({ q: "a b&c", limit: 20, verified_only: true })).toBe("?q=a%20b%26c&limit=20&verified_only=true");
  });
  it("keeps a zero offset out but a zero coordinate in", () => {
    expect(queryString({ lat: 0, lon: 0 })).toBe("?lat=0&lon=0");
  });
});

describe("osmLink", () => {
  it("links out to openstreetmap.org with a marker, loading no tiles", () => {
    expect(osmLink(20.2961, 85.8245)).toBe(
      "https://www.openstreetmap.org/?mlat=20.296100&mlon=85.824500#map=17/20.296100/85.824500",
    );
  });
});

describe("telHref", () => {
  it("keeps digits and a leading plus", () => {
    expect(telHref("+91 (674) 123-4567")).toBe("tel:+916741234567");
  });
  it("refuses missing or unusable numbers", () => {
    expect(telHref(null)).toBeNull();
    expect(telHref("n/a")).toBeNull();
    expect(telHref("123")).toBeNull();
  });
});

describe("distanceLabel", () => {
  it("is absent without a distance and plain with one", () => {
    expect(distanceLabel(null)).toBeNull();
    expect(distanceLabel(0.4)).toBe("Less than 1 km away");
    expect(distanceLabel(3.26)).toBe("3.3 km away");
  });
});

describe("stock wording", () => {
  it("always says reported, and by whom", () => {
    expect(stockHeadline(stock())).toBe("Reported in stock by Test feed");
    expect(stockHeadline(stock({ reported: "low_stock" }))).toBe("Reported low in stock by Test feed");
    expect(stockHeadline(stock({ reported: "out_of_stock" }))).toBe("Reported out of stock by Test feed");
  });
  it("never claims availability without a report", () => {
    expect(stockHeadline(stock({ state: "no_feed", reported: null }))).toBe("No stock information");
    for (const s of [stock(), stock({ reported: "low_stock" }), stock({ state: "no_feed", reported: null })]) {
      expect(stockHeadline(s)).not.toMatch(/^(available|in stock)/i);
    }
  });
  it("labels a price as reported and possibly different", () => {
    expect(priceText(stock({ price_amount: "12.5", currency: "INR" }))).toBe("INR 12.50 as reported. The price may differ.");
    expect(priceText(stock())).toBeNull();
    expect(priceText(stock({ price_amount: "x", currency: "INR" }))).toBeNull();
  });
});

describe("appointments", () => {
  it("says a request-only booking was not sent", () => {
    expect(STATUS_BADGE.request_only.label).toMatch(/not sent/i);
    expect(STATUS_BADGE.sent.label).not.toMatch(/confirm/i);
    expect(STATUS_BADGE.confirmed.tone).toBe("success");
  });
  it("lets open requests be cancelled and closed ones not", () => {
    expect(CAN_CANCEL).toEqual(["request_only", "sent", "confirmed"]);
  });
  it("offers dates from today to 90 days ahead", () => {
    expect(bookingRange(new Date(2026, 10, 15))).toEqual({ min: "2026-11-15", max: "2027-02-13" });
  });
});

describe("text helpers", () => {
  it("capitalises words", () => {
    expect(capitalise("general medicine")).toBe("General Medicine");
    expect(capitalise("odia")).toBe("Odia");
  });
  it("formats dates and survives junk", () => {
    expect(formatDate("2026-11-15")).toMatch(/15/);
    expect(formatDate("not a date")).toBe("not a date");
  });
});
