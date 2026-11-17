import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

expect.extend(axeMatchers);
const axe = configureAxe({ rules: { region: { enabled: false } } });
declare module "vitest" {
  interface Assertion {
    toHaveNoViolations(): void;
  }
}

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const prof = vi.hoisted(() => ({
  profile: {
    display_name: "Asha Rao", date_of_birth: null, preferred_language: "en", timezone: "Asia/Kolkata", height_cm: null, weight_kg: null,
    blood_group: null, onboarding_completed: true, completeness: 40,
    accessibility_preferences: { large_text: false, high_contrast: false, reduce_motion: false, voice_enabled: false },
  },
}));
vi.mock("@/lib/profile-context", async (orig) => {
  const real = await orig<typeof import("@/lib/profile-context")>();
  const value = { profile: prof.profile, save: vi.fn(), reload: vi.fn() };
  return { ...real, useProfile: () => value, useOptionalProfile: () => value };
});

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", async (orig) => ({ ...(await orig<typeof import("@/lib/api-client")>()), api: apiMock }));

import DashboardPage from "@/app/(app)/dashboard/page";
import { ApiError } from "@/lib/api-client";
import { ExperienceProvider } from "@/lib/experience";

const page = <T,>(items: T[]) => ({ items, total: items.length, limit: 50, offset: 0 });
const dose = (o = {}) => ({
  id: "d1", medication_id: "m1", schedule_id: "s1", scheduled_at: "2026-11-17T06:30:00Z", status: "pending", taken_at: null, note: null,
  supply_id: null, units_used: null, overdue: false, medication_name: "Metformin", dose_text: "500 mg", ...o,
});
const lab = (o = {}) => ({
  id: "l1", record_id: null, test_name: "HbA1c", value_numeric: 6.1, value_text: null, unit: "%", ref_low: 4, ref_high: 5.6, flag: "high",
  observed_on: "2026-11-01", notes: null, status: "active", verification_status: "patient_reported", ...o,
});
const record = (o = {}) => ({
  id: "r1", record_type: "prescription", title: "Clinic prescription", record_date: "2026-11-10", provider_name: "Dr Rao", notes: null, status: "active",
  verification_status: "patient_reported", has_file: false, file_name: null, file_content_type: null, file_size: null, created_at: "2026-11-10T10:00:00Z", ...o,
});
const note = (o = {}) => ({ id: "n1", kind: "dose_due", title: "Dose due", body: "Time for Metformin", due_at: "2026-11-17T06:00:00Z", delivered_at: null, read_at: null, dose_log_id: null, medication_id: null, ...o });
const appt = (o = {}) => ({
  id: "a1", doctor: { id: "d", display_name: "Dr Amy", clinic_name: "Test Clinic", phone: null, city: "Bhubaneswar" }, preferred_date: "2026-11-25",
  preferred_window: "morning", reason: null, mode: "request_only", status: "request_only", status_text: "", provider_reference: null,
  provider_responded_at: null, provider_message: null, created_at: "2026-11-10T00:00:00Z", ...o,
});

let data: Record<string, unknown>;
let failing: Set<string>;
function route() {
  apiMock.mockImplementation(async (path: string, opts?: { method?: string }) => {
    const base = path.split("?")[0]!;
    if (failing.has(base)) throw new ApiError(500, "HTTP_ERROR", `${base} failed`);
    if (opts?.method === "POST") return {};
    if (!(base in data)) throw new ApiError(404, "NOT_FOUND", "not found");
    return data[base];
  });
}

const renderPage = () => render(<ExperienceProvider><DashboardPage /></ExperienceProvider>);
const calls = (needle: string) => apiMock.mock.calls.filter(([p]) => String(p).includes(needle));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T06:00:00Z")); // 11:30 in India
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-experience");
  apiMock.mockReset();
  failing = new Set();
  data = {
    "/doses": page([dose()]),
    "/labs": page([lab(), lab({ id: "l0", observed_on: "2026-06-01", value_numeric: 5.8 })]),
    "/labs/trend": { test_name: "HbA1c", unit: "%", ref_low: 4, ref_high: 5.6, points: [
      { id: "l0", observed_on: "2026-06-01", value: 5.8, flag: "high" }, { id: "l1", observed_on: "2026-11-01", value: 6.1, flag: "high" } ] },
    "/records": page([record()]),
    "/medications/alerts": [{ kind: "refill_soon", medication_id: "m1", medication_name: "Metformin", supply_id: "s1", lot_number: null, expiry_date: null, days_left: 3, remaining: 6 }],
    "/notifications": page([note()]),
    "/notifications/unread-count": { count: 1 },
    "/appointments": page([appt()]),
    "/assistant/status": { mode: "evidence_only", provider: "x", model: null, consent_granted: false, notices: [] },
    "/emergency/contacts": page([]),
  };
  route();
});
afterEach(() => vi.useRealTimers());

describe("dashboard with data", () => {
  it("greets by first name with a line derived from real doses", async () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Hello, Asha" })).toBeInTheDocument();
    expect(await screen.findByText("1 dose still to take today.")).toBeInTheDocument();
  });

  it("shows each widget with its real data", async () => {
    renderPage();
    const today = await screen.findByRole("region", { name: "Today" });
    expect(within(today).getByText("Metformin")).toBeInTheDocument();
    expect(within(today).getByText("500 mg")).toBeInTheDocument();

    const attention = screen.getByRole("region", { name: "Needs attention" });
    expect(await within(attention).findByText(/about 3 days of supply left/)).toBeInTheDocument();
    expect(within(attention).getByText("Running low")).toBeInTheDocument();
    expect(within(attention).getByText("Time for Metformin")).toBeInTheDocument();

    const labs = await screen.findByRole("region", { name: "Lab highlights" });
    expect(within(labs).getByText("HbA1c")).toBeInTheDocument();
    expect(within(labs).getAllByText("Above report range").length).toBeGreaterThan(0);
    expect(within(labs).getByText("Report range: 4–5.6 %")).toBeInTheDocument();
    expect(within(labs).getByText("Patient reported")).toBeInTheDocument();

    const timeline = await screen.findByRole("region", { name: "Recent activity" });
    expect(await within(timeline).findByText("Clinic prescription")).toBeInTheDocument();
    expect(within(timeline).getByText("HbA1c: 6.1 %")).toBeInTheDocument();

    const upcoming = await screen.findByRole("region", { name: "Appointment requests" });
    expect(within(upcoming).getByText("Dr Amy")).toBeInTheDocument();
    expect(within(upcoming).getByText("Saved here only. Not sent")).toBeInTheDocument();
    expect(within(upcoming).getByText(/requests, not confirmed bookings/)).toBeInTheDocument();
  });

  it("never invents a score and never calls a lab result abnormal", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Lab highlights" });
    await screen.findByText("Clinic prescription");
    const text = document.body.textContent!.toLowerCase();
    expect(text).not.toMatch(/score|abnormal|all clear|\bsafe\b|healthy/);
  });

  it("offers the trend with its data table only when two comparable results exist", async () => {
    renderPage();
    const labs = await screen.findByRole("region", { name: "Lab highlights" });
    const summary = await within(labs).findByText("Show trend for HbA1c");
    await userEvent.setup({ advanceTimers: () => {} }).click(summary);
    expect(within(labs).getByRole("table")).toBeInTheDocument();
  });

  it("does not offer a trend when there is only one result", async () => {
    data["/labs"] = page([lab()]);
    renderPage();
    await screen.findByRole("region", { name: "Lab highlights" });
    await screen.findByText("Report range: 4–5.6 %");
    expect(screen.queryByText(/Show trend for/)).toBeNull();
    expect(calls("/labs/trend")).toHaveLength(0);
  });

  it("states what the assistant can use, shows the real consent state and the notice", async () => {
    renderPage();
    const ai = await screen.findByRole("region", { name: "Ask the assistant" });
    expect(within(ai).getByText(/Nothing has been shared with it yet/)).toBeInTheDocument();
    expect(await within(ai).findByText("Permission to use your records: not given")).toBeInTheDocument();
    expect(within(ai).getByText(/not a substitute for professional medical advice/)).toBeInTheDocument();
    expect(within(ai).getByRole("link", { name: "Open the assistant" })).toHaveAttribute("href", "/assistant");
  });

  it("reflects consent when granted", async () => {
    data["/assistant/status"] = { mode: "llm", provider: "x", model: "m", consent_granted: true, notices: [] };
    renderPage();
    expect(await screen.findByText("Permission to use your records: given")).toBeInTheDocument();
  });

  it("links quick actions to real pages", async () => {
    renderPage();
    const qa = screen.getByRole("region", { name: "Quick actions" });
    const hrefs = within(qa).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/records", "/medications", "/labs", "/assistant", "/profile", "/care"]);
  });

  it("lists what is missing from the profile and does not claim it measures health", async () => {
    renderPage();
    const c = await screen.findByRole("region", { name: "Profile completeness" });
    expect(within(c).getByText("40%")).toBeInTheDocument();
    await waitFor(() => expect(within(c).getByText("Emergency contact")).toBeInTheDocument());
    expect(within(c).getByText("Date of birth")).toBeInTheDocument();
    expect(within(c).getByText(/not a measure of your health/)).toBeInTheDocument();
    expect(within(c).getByRole("link", { name: "Finish your profile" })).toHaveAttribute("href", "/profile");
  });

  it("opens a timeline row to show details, from the keyboard", async () => {
    renderPage();
    const row = await screen.findByRole("button", { name: "Show details for Clinic prescription" });
    expect(row).toHaveAttribute("aria-expanded", "false");
    row.focus();
    await userEvent.setup({ advanceTimers: () => {} }).keyboard("{Enter}");
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Open in Records" })).toHaveAttribute("href", "/records");
  });
});

describe("dashboard actions", () => {
  it("Taken calls the take endpoint, Skip calls skip, and nothing is sent on load", async () => {
    renderPage();
    const take = await screen.findByRole("button", { name: "Mark Metformin as taken" });
    expect(calls("/take")).toHaveLength(0);
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(take);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/doses/d1/take", { method: "POST", body: {} }));

    await user.click(await screen.findByRole("button", { name: "Skip Metformin" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/doses/d1/skip", { method: "POST", body: {} }));
  });

  it("shows taken doses from the server status only", async () => {
    data["/doses"] = page([dose({ status: "taken", taken_at: "2026-11-17T05:00:00Z" })]);
    renderPage();
    const today = await screen.findByRole("region", { name: "Today" });
    expect(await within(today).findByText("Taken")).toBeInTheDocument();
    expect(within(today).queryByRole("button", { name: /Mark Metformin as taken/ })).toBeNull();
  });

  it("marks a reminder read through the existing endpoint", async () => {
    renderPage();
    const btn = await screen.findByRole("button", { name: "Mark “Dose due” as read" });
    await userEvent.setup({ advanceTimers: () => {} }).click(btn);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/notifications/n1/read", { method: "POST" }));
  });

  it("shows an error when a dose action fails and keeps the dose pending", async () => {
    apiMock.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (opts?.method === "POST") throw new ApiError(409, "CONFLICT", "That dose was already updated.");
      return data[path.split("?")[0]!];
    });
    renderPage();
    await userEvent.setup({ advanceTimers: () => {} }).click(await screen.findByRole("button", { name: "Mark Metformin as taken" }));
    expect(await screen.findByText("That dose was already updated.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Metformin as taken" })).toBeInTheDocument();
  });
});

describe("dashboard states", () => {
  it("shows empty states that say what is missing", async () => {
    data["/doses"] = page([]);
    data["/labs"] = page([]);
    data["/records"] = page([]);
    data["/medications/alerts"] = [];
    data["/notifications"] = page([]);
    data["/notifications/unread-count"] = { count: 0 };
    data["/appointments"] = page([]);
    renderPage();
    expect(await screen.findByText("No doses are scheduled for today.")).toBeInTheDocument();
    expect(await screen.findByText("No lab results yet.")).toBeInTheDocument();
    expect(await screen.findByText("Nothing has been recorded yet.")).toBeInTheDocument();
    expect(await screen.findByText("Nothing needs attention right now.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Today" })).getByRole("link", { name: "Add medication" })).toHaveAttribute("href", "/medications");
    expect(screen.getByText("Here’s what’s on your health record today.")).toBeInTheDocument();
  });

  it("hides the appointment tile when there are no requests", async () => {
    data["/appointments"] = page([]);
    renderPage();
    await screen.findByRole("region", { name: "Today" });
    await waitFor(() => expect(calls("/appointments")).toHaveLength(1));
    expect(screen.queryByRole("region", { name: "Appointment requests" })).toBeNull();
  });

  it("does not list cancelled requests", async () => {
    data["/appointments"] = page([appt({ status: "cancelled" })]);
    renderPage();
    await screen.findByRole("region", { name: "Today" });
    await waitFor(() => expect(calls("/appointments")).toHaveLength(1));
    expect(screen.queryByRole("region", { name: "Appointment requests" })).toBeNull();
  });

  it("shows loading placeholders before data arrives", () => {
    apiMock.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(3);
    expect(screen.getByText("Loading Today")).toBeInTheDocument();
  });

  it("a failing alerts call does not hide the other tiles or the reminders", async () => {
    failing.add("/medications/alerts");
    renderPage();
    const attention = await screen.findByRole("region", { name: "Needs attention" });
    expect(await within(attention).findByText("/medications/alerts failed")).toBeInTheDocument();
    expect(within(attention).getByText("Time for Metformin")).toBeInTheDocument();
    expect(within(await screen.findByRole("region", { name: "Today" })).getByText("Metformin")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Lab highlights" })).toBeInTheDocument();
  });

  it("a failing doses call shows an error with retry in that tile only", async () => {
    failing.add("/doses");
    renderPage();
    const today = await screen.findByRole("region", { name: "Today" });
    expect(await within(today).findByRole("alert")).toHaveTextContent("/doses failed");
    expect(within(today).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(await screen.findByText("HbA1c")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Quick actions" })).toBeInTheDocument();

    failing.delete("/doses");
    await userEvent.setup({ advanceTimers: () => {} }).click(within(today).getByRole("button", { name: "Try again" }));
    expect(await within(today).findByText("Metformin")).toBeInTheDocument();
  });

  it("a failing labs call shows an error in lab highlights while recent activity still lists records", async () => {
    failing.add("/labs");
    renderPage();
    const labs = await screen.findByRole("region", { name: "Lab highlights" });
    expect(await within(labs).findByRole("alert")).toHaveTextContent("/labs failed");
    expect(await screen.findByText("Clinic prescription")).toBeInTheDocument();
  });
});

describe("easy-read dashboard", () => {
  beforeEach(() => window.localStorage.setItem("medicare.experience", "easy"));

  it("shows only today, needs attention, ask AI and quick actions, and skips the other requests", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Today" });
    expect(screen.getByRole("region", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ask the assistant" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Quick actions" })).toBeInTheDocument();
    for (const name of ["Recent activity", "Lab highlights", "Appointment requests", "Profile completeness"]) {
      expect(screen.queryByRole("region", { name })).toBeNull();
    }
    expect(calls("/labs")).toHaveLength(0);
    expect(calls("/records")).toHaveLength(0);
    expect(calls("/appointments")).toHaveLength(0);
  });

  it("drops the example questions to keep one clear action", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Ask the assistant" });
    expect(screen.queryByText("Examples of what you could ask")).toBeNull();
    expect(screen.getByRole("link", { name: "Open the assistant" })).toBeInTheDocument();
  });
});

describe("accessibility", () => {
  it("has no axe violations with data", async () => {
    const { container } = renderPage();
    await screen.findByRole("region", { name: "Appointment requests" });
    await screen.findByText("Clinic prescription");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations when tiles fail", async () => {
    failing = new Set(["/doses", "/labs", "/records", "/medications/alerts"]);
    const { container } = renderPage();
    await screen.findAllByRole("alert");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations in easy-read mode", async () => {
    window.localStorage.setItem("medicare.experience", "easy");
    const { container } = renderPage();
    await screen.findByRole("region", { name: "Today" });
    expect(await axe(container)).toHaveNoViolations();
  });
});
