import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentsPanel } from "@/components/care/AppointmentsPanel";
import { DoctorFinder } from "@/components/care/DoctorFinder";
import { PharmacyFinder } from "@/components/care/PharmacyFinder";
import { PlansCard } from "@/components/diet/PlansCard";
import { ApiError } from "@/lib/api-client";

const api = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  api: (...args: unknown[]) => api(...args),
}));

const source = { name: "Test directory", publisher: null, url: null, licence: "CC0", jurisdiction: "IN", retrieved_on: "2026-11-01" };
const fresh = { state: "fresh", observed_at: "2026-11-15T00:00:00Z", age_days: 0, label: "Updated 3 hours ago." };
const stale = { state: "stale", observed_at: "2026-01-01T00:00:00Z", age_days: 300, label: "Last updated 300 days ago. May be out of date." };

const pharmacy = (over = {}) => ({
  id: "p1", name: "Alpha Chemist", address_line: "1 Test Road", city: "Bhubaneswar", state: null, postal_code: null,
  latitude: 20.3, longitude: 85.8, phone: "0674 111 2222", hours_text: null, verification_status: "source_listed",
  source, freshness: fresh, distance_km: null, stock: null, ...over,
});
const doctor = (over = {}) => ({
  id: "d1", display_name: "Dr Amy", clinic_name: "Test Clinic", specialties: ["general medicine"], languages: ["odia"],
  address_line: null, city: "Bhubaneswar", state: null, postal_code: null, latitude: null, longitude: null, phone: null,
  booking_mode: "request_only", appointment_note: "Requests are saved in this app only and are not sent to the clinic. Call the clinic to book.",
  credential_status: "unverified", credential_label: "Not verified.", credentials: [], source, freshness: fresh, distance_km: null, ...over,
});
const page = (items: unknown[], notice = "A notice.") => ({ items, total: items.length, limit: 20, offset: 0, notice });

beforeEach(() => api.mockReset());

describe("PharmacyFinder", () => {
  it("shows source, age, a call link and an OpenStreetMap link-out, and never a bare 'available'", async () => {
    api.mockResolvedValueOnce(page([pharmacy({ freshness: stale })], "Call the pharmacy to confirm."));
    render(<PharmacyFinder />);
    await userEvent.click(screen.getByRole("button", { name: "Search pharmacies" }));
    const card = (await screen.findByText("Alpha Chemist")).closest("li")!;
    expect(within(card).getByText(/May be out of date/)).toBeInTheDocument();
    expect(within(card).getByText(/Test directory/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /Call 0674 111 2222/ })).toHaveAttribute("href", "tel:06741112222");
    const map = within(card).getByRole("link", { name: /OpenStreetMap/ });
    expect(map.getAttribute("href")).toMatch(/^https:\/\/www\.openstreetmap\.org\//);
    expect(map).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText("Call the pharmacy to confirm.")).toBeInTheDocument();
    expect(card.textContent).toContain("No hours listed. Call to ask.");
  });

  it("says plainly when there is no stock information", async () => {
    api.mockResolvedValueOnce(
      page([pharmacy({ stock: { state: "no_feed", reported: null, price_amount: null, currency: null, pack_size_text: null, source_name: null, source_timestamp: null, freshness: null, call_to_confirm: true, message: "No stock information is available for this pharmacy. Call to confirm availability." } })]),
    );
    render(<PharmacyFinder />);
    await userEvent.click(screen.getByRole("button", { name: "Search pharmacies" }));
    expect(await screen.findByText("No stock information")).toBeInTheDocument();
    expect(screen.getByText(/Call to confirm availability/)).toBeInTheDocument();
  });

  it("reports a search failure", async () => {
    api.mockRejectedValueOnce(new ApiError(500, "X", "Server trouble."));
    render(<PharmacyFinder />);
    await userEvent.click(screen.getByRole("button", { name: "Search pharmacies" }));
    expect(await screen.findByText("Server trouble.")).toBeInTheDocument();
  });

  it("keeps location out of the request unless the person asks for it", async () => {
    api.mockResolvedValueOnce(page([]));
    render(<PharmacyFinder />);
    await userEvent.click(screen.getByRole("button", { name: "Search pharmacies" }));
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(api.mock.calls[0]![0]).not.toMatch(/lat=|lon=/);
    expect(screen.getByText(/It is not saved/)).toBeInTheDocument();
  });
});

describe("DoctorFinder", () => {
  it("labels credentials honestly and explains what a request does", async () => {
    api.mockResolvedValueOnce(["general medicine"]); // specialties
    api.mockResolvedValueOnce(page([doctor()], "Not ranked."));
    render(<DoctorFinder onBooked={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Search doctors" }));
    const card = (await screen.findByText("Dr Amy")).closest("li")!;
    expect(within(card).getByText("Credentials not verified")).toBeInTheDocument();
    expect(within(card).getAllByText(/saved in this app only/i).length).toBeGreaterThan(0);
    expect(within(card).getByText("General Medicine")).toBeInTheDocument();
    expect(within(card).getByText(/Speaks Odia/)).toBeInTheDocument();
  });

  it("shows 'verified' only for a verified credential", async () => {
    api.mockResolvedValueOnce([]);
    api.mockResolvedValueOnce(
      page([
        doctor({ id: "d2", display_name: "Dr Ver", credential_status: "verified", credential_label: "Verified against Council on 2026-11-01." }),
        doctor({ id: "d3", display_name: "Dr Listed", credential_status: "source_listed", credential_label: "Listed by the directory source. Not independently verified." }),
      ]),
    );
    render(<DoctorFinder onBooked={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Search doctors" }));
    await screen.findByText("Dr Ver");
    expect(screen.getByText("Credentials verified")).toBeInTheDocument();
    expect(screen.getByText("Credentials listed, not verified")).toBeInTheDocument();
  });

  it("records a request and tells the person it was not sent", async () => {
    const onBooked = vi.fn();
    api.mockResolvedValueOnce([]);
    api.mockResolvedValueOnce(page([doctor()]));
    render(<DoctorFinder onBooked={onBooked} />);
    await userEvent.click(screen.getByRole("button", { name: "Search doctors" }));
    await userEvent.click(await screen.findByRole("button", { name: "Request an appointment" }));
    await userEvent.click(screen.getByRole("button", { name: "Save request" }));
    expect(await screen.findByText("Choose a day.")).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2); // nothing was posted without a day

    api.mockResolvedValueOnce({ id: "a1", status: "request_only", status_text: "Saved in this app only. It has NOT been sent to the clinic." });
    const day = screen.getByLabelText("Preferred day");
    await userEvent.type(day, "2026-12-01");
    await userEvent.click(screen.getByRole("button", { name: "Save request" }));
    expect(await screen.findByText(/NOT been sent to the clinic/)).toBeInTheDocument();
    expect(onBooked).toHaveBeenCalled();
    const post = api.mock.calls.at(-1)!;
    expect(post[0]).toBe("/appointments");
    expect(post[1].body).toMatchObject({ doctor_id: "d1", preferred_date: "2026-12-01", preferred_window: "any" });
  });
});

describe("AppointmentsPanel", () => {
  const appt = (over = {}) => ({
    id: "a1", doctor: { id: "d1", display_name: "Dr Amy", clinic_name: null, phone: "0674 000 0000", city: "X" },
    preferred_date: "2026-12-01", preferred_window: "morning", reason: null, mode: "request_only", status: "request_only",
    status_text: "Saved in this app only. It has NOT been sent to the clinic. Call 0674 000 0000 to book.",
    provider_reference: null, provider_responded_at: null, provider_message: null, created_at: "2026-11-15T00:00:00Z", ...over,
  });

  it("never shows a saved-only request as confirmed, and offers to cancel it", async () => {
    api.mockResolvedValueOnce({ items: [appt()], total: 1, limit: 50, offset: 0 });
    render(<AppointmentsPanel version={0} />);
    expect(await screen.findByText("Saved here only. Not sent")).toBeInTheDocument();
    expect(screen.queryByText(/Confirmed/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel request" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Call 0674 000 0000/ })).toBeInTheDocument();
  });

  it("shows confirmed only with the clinic's reply, and no cancel for a declined one", async () => {
    api.mockResolvedValueOnce({
      items: [
        appt({ id: "a2", status: "confirmed", mode: "provider", status_text: "Confirmed by the clinic on 2026-11-16.", provider_message: "See you then" }),
        appt({ id: "a3", status: "declined", mode: "provider", status_text: "The clinic could not accept this request." }),
      ],
      total: 2, limit: 50, offset: 0,
    });
    render(<AppointmentsPanel version={0} />);
    expect(await screen.findByText("Confirmed by the clinic")).toBeInTheDocument();
    expect(screen.getByText(/Clinic message: See you then/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Cancel request" })).toHaveLength(1);
  });

  it("cancels and reloads", async () => {
    api.mockResolvedValueOnce({ items: [appt()], total: 1, limit: 50, offset: 0 });
    render(<AppointmentsPanel version={0} />);
    api.mockResolvedValueOnce({}); // cancel
    api.mockResolvedValueOnce({ items: [appt({ status: "cancelled", status_text: "Cancelled in this app. The clinic was never notified." })], total: 1, limit: 50, offset: 0 });
    await userEvent.click(await screen.findByRole("button", { name: "Cancel request" }));
    expect(await screen.findByText(/clinic was never notified/)).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/appointments/a1/cancel", { method: "POST" });
  });
});

describe("PlansCard", () => {
  it("shows a dietitian-review stop as a caution, not an error", async () => {
    api.mockResolvedValueOnce({ items: [], total: 0, limit: 20, offset: 0 });
    render(<PlansCard canCreate version={0} />);
    api.mockRejectedValueOnce(new ApiError(409, "DIETITIAN_REVIEW_REQUIRED", "Kidney conditions need a diet set by your care team."));
    await userEvent.click(screen.getByRole("button", { name: "Make a 7-day plan" }));
    expect(await screen.findByText("Please talk to a clinician or dietitian")).toBeInTheDocument();
    expect(screen.getByText(/care team/)).toBeInTheDocument();
  });

  it("disables plan creation until preferences are saved", async () => {
    api.mockResolvedValueOnce({ items: [], total: 0, limit: 20, offset: 0 });
    render(<PlansCard canCreate={false} version={0} />);
    expect(screen.getByRole("button", { name: "Make a 7-day plan" })).toBeDisabled();
    expect(screen.getByText("Save your preferences first.")).toBeInTheDocument();
  });

  it("shows what a plan used and its limits", async () => {
    api.mockResolvedValueOnce({ items: [], total: 0, limit: 20, offset: 0 });
    render(<PlansCard canCreate version={0} />);
    api.mockResolvedValueOnce({
      id: "pl1", title: "7-day meal ideas", created_at: "2026-11-15T00:00:00Z", catalogue_version: "v1",
      constraints_used: { diet_type: "vegetarian", cuisine: "east_indian", meals_per_day: 3, avoid_foods: ["brinjal"], allergies_applied: ["peanuts"], allergies_not_matched: [], avoid_not_matched: [], ideas_available: 12 },
      review_flags: [{ code: "general_education", severity: "info", message: "dup" }, { code: "medicines_recorded", severity: "review", message: "You have medicines recorded." }],
      days: [{ day: 1, meals: [{ slot: "lunch", idea_id: "m-dalma", name: "Dalma with rice", description: "Lentils with vegetables.", ingredients: ["toor dal", "rice"] }, { slot: "dinner", idea_id: null, name: null, description: "No idea in our small collection fits your choices for this meal.", ingredients: [] }] }],
      limitations: ["No portions, calories or nutrient targets are given."], notice: "These are general meal ideas.",
    });
    await userEvent.click(screen.getByRole("button", { name: "Make a 7-day plan" }));
    expect(await screen.findByText("Dalma with rice.")).toBeInTheDocument();
    expect(screen.getByText(/Recorded allergies applied: peanuts/)).toBeInTheDocument();
    expect(screen.getByText("You have medicines recorded.")).toBeInTheDocument();
    expect(screen.queryByText("dup")).not.toBeInTheDocument();
    expect(screen.getByText(/No idea in our small collection/)).toBeInTheDocument();
    expect(screen.getByText(/No portions, calories or nutrient targets/)).toBeInTheDocument();
  });
});
