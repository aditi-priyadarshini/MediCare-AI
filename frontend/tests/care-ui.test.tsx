import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentsPanel } from "@/components/care/AppointmentsPanel";
import { BookingForm } from "@/components/care/BookingForm";
import { DoctorFinder } from "@/components/care/DoctorFinder";
import { PharmacyFinder } from "@/components/care/PharmacyFinder";
import { DietPlanner } from "@/components/diet/DietPlanner";
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
    render(<DoctorFinder />);
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
    render(<DoctorFinder />);
    await userEvent.click(screen.getByRole("button", { name: "Search doctors" }));
    await screen.findByText("Dr Ver");
    expect(screen.getByText("Credentials verified")).toBeInTheDocument();
    expect(screen.getByText("Credentials listed, not verified")).toBeInTheDocument();
  });

  it("opens the request on its own page instead of an inline form", async () => {
    api.mockResolvedValueOnce([]);
    api.mockResolvedValueOnce(page([doctor()]));
    render(<DoctorFinder />);
    await userEvent.click(screen.getByRole("button", { name: "Search doctors" }));
    const link = await screen.findByRole("link", { name: "Request an appointment" });
    expect(link).toHaveAttribute("href", "/care/book/d1");
    expect(screen.queryByLabelText("Preferred day")).not.toBeInTheDocument();
  });
});

describe("BookingForm", () => {
  it("records a request and tells the person it was not sent", async () => {
    const onDone = vi.fn();
    render(<BookingForm doctor={doctor() as never} onDone={onDone} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Save request" }));
    expect(await screen.findByText("Choose a day.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled(); // nothing was posted without a day

    api.mockResolvedValueOnce({ id: "a1", status: "request_only", status_text: "Saved in this app only. It has NOT been sent to the clinic." });
    await userEvent.type(screen.getByLabelText("Preferred day"), "2026-12-01");
    await userEvent.click(screen.getByRole("button", { name: "Save request" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0]![0].status_text).toMatch(/NOT been sent to the clinic/);
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

const plan = (over = {}) => ({
  id: "pl1", title: "7-day meal ideas", created_at: new Date().toISOString(), catalogue_version: "v1",
  constraints_used: { diet_type: "vegetarian", cuisine: "east_indian", meals_per_day: 3, avoid_foods: ["brinjal"], allergies_applied: ["peanuts"], allergies_not_matched: [], avoid_not_matched: [], ideas_available: 12 },
  review_flags: [{ code: "general_education", severity: "info", message: "dup" }, { code: "medicines_recorded", severity: "review", message: "You have medicines recorded." }],
  days: [
    { day: 1, meals: [{ slot: "lunch", idea_id: "m-dalma", name: "Dalma with rice", description: "Lentils with vegetables.", ingredients: ["toor dal", "rice"] }, { slot: "dinner", idea_id: null, name: null, description: "No idea in our small collection fits your choices for this meal.", ingredients: [] }] },
    { day: 2, meals: [{ slot: "lunch", idea_id: "m-khichdi", name: "Khichdi", description: "Rice and moong.", ingredients: ["rice", "moong"] }] },
  ],
  limitations: ["No portions, calories or nutrient targets are given."], notice: "These are general meal ideas.", ...over,
});
const prefs = (over = {}) => ({
  diet_type: "vegetarian", cuisine: "east_indian", meals_per_day: 3, avoid_foods: ["brinjal"], situations: [], saved: true,
  review_flags: [], notice: "", updated_at: null, ...over,
});
const empty = { items: [], total: 0, limit: 20, offset: 0 };

describe("DietPlanner", () => {
  it("shows a dietitian-review stop as a caution, not an error", async () => {
    api.mockResolvedValueOnce(prefs()).mockResolvedValueOnce(empty);
    render(<DietPlanner />);
    api.mockRejectedValueOnce(new ApiError(409, "DIETITIAN_REVIEW_REQUIRED", "Kidney conditions need a diet set by your care team."));
    await userEvent.click(await screen.findByRole("button", { name: "Make a 7-day plan" }));
    expect(await screen.findByText("Please talk to a clinician or dietitian")).toBeInTheDocument();
    expect(screen.getByText(/care team/)).toBeInTheDocument();
  });

  it("offers no plan until preferences are saved, and sends the person to the preferences page", async () => {
    api.mockResolvedValueOnce(prefs({ saved: false })).mockResolvedValueOnce(empty);
    render(<DietPlanner />);
    expect(await screen.findByText("Tell us how you eat first")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make a 7-day plan" })).not.toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Set food preferences" });
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l).toHaveAttribute("href", "/diet/preferences");
  });

  it("opens the newest plan as day cards, with today's meals first, and keeps the form closed", async () => {
    api.mockResolvedValueOnce(prefs()).mockResolvedValueOnce({ items: [{ id: "pl1", title: "7-day meal ideas", created_at: new Date().toISOString(), catalogue_version: "v1" }], total: 1, limit: 20, offset: 0 }).mockResolvedValueOnce(plan());
    render(<DietPlanner />);
    expect(await screen.findByRole("heading", { name: /^Today/ })).toBeInTheDocument();
    expect(screen.getAllByText("Dalma with rice").length).toBeGreaterThan(0);
    expect(screen.getByText(/Recorded allergies applied: peanuts/)).toBeInTheDocument();
    expect(screen.getByText("You have medicines recorded.")).toBeInTheDocument();
    expect(screen.queryByText("dup")).not.toBeInTheDocument();
    expect(screen.getByText(/No idea in our small collection/)).toBeInTheDocument();
    expect(screen.getByText(/No portions, calories or nutrient targets/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Eating pattern")).not.toBeInTheDocument(); // the form is on its own page
    expect(screen.getByRole("link", { name: /Edit food preferences/ })).toHaveAttribute("href", "/diet/preferences");
    // The whole week is one card per day, and a day can be picked.
    await userEvent.click(screen.getByRole("button", { name: /Show day 2/ }));
    expect(screen.getByRole("heading", { name: /^Day 2/ })).toBeInTheDocument();
  });

  it("says when a plan has ended", async () => {
    const old = new Date(Date.now() - 20 * 86_400_000).toISOString();
    api.mockResolvedValueOnce(prefs()).mockResolvedValueOnce({ items: [{ id: "pl1", title: "7-day meal ideas", created_at: old, catalogue_version: "v1" }], total: 1, limit: 20, offset: 0 }).mockResolvedValueOnce(plan({ created_at: old }));
    render(<DietPlanner />);
    expect(await screen.findByText("This plan has ended")).toBeInTheDocument();
  });
});
