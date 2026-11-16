import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmergencyPanel } from "@/components/emergency/EmergencyPanel";

const api = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  api: (...args: unknown[]) => api(...args),
}));

let authStatus: "loading" | "anonymous" | "authenticated" = "anonymous";
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ status: authStatus }) }));

const sim = (over = {}) => ({
  id: "s1", is_simulation: true, notice: "SIMULATION ONLY. No ambulance was contacted or sent, and none is on its way. In a real emergency call 112.",
  status: "requested", location_shared: false, is_open: true, next_status: "acknowledged",
  history: [{ status: "requested", at: "2026-11-16T10:00:00Z" }], created_at: "2026-11-16T10:00:00Z", updated_at: "2026-11-16T10:00:00Z", ...over,
});

beforeEach(() => {
  api.mockReset();
  authStatus = "anonymous";
});

describe("EmergencyPanel", () => {
  it("always offers a working call link, without sign-in or any request", () => {
    render(<EmergencyPanel />);
    expect(screen.getByRole("link", { name: /Call 112/ })).toHaveAttribute("href", "tel:112");
    expect(screen.getByText(/cannot place the call for you/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("says plainly that no ambulance service is connected and offers no request button", async () => {
    authStatus = "authenticated";
    api.mockImplementation(async (path: string) => {
      if (path === "/emergency/status") return { emergency_number: "112", dispatch_available: false };
      if (path === "/emergency/simulations") return [];
      if (path === "/emergency/contacts") return { items: [], total: 0, limit: 50, offset: 0 };
      if (path === "/emergency/settings") return { include_blood_group: true, include_allergies: true, include_conditions: false, include_medications: false, include_contacts: true };
      throw new Error(`unexpected ${path}`);
    });
    render(<EmergencyPanel />);
    expect(await screen.findByText(/No ambulance service is connected to this app/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request ambulance" })).not.toBeInTheDocument();
  });

  it("keeps the practice run labelled as a simulation and needs both confirmations to start", async () => {
    authStatus = "authenticated";
    api.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === "/emergency/status") return { emergency_number: "112", dispatch_available: false };
      if (path === "/emergency/simulations") return options?.method === "POST" ? sim() : [];
      if (path === "/emergency/contacts") return { items: [], total: 0, limit: 50, offset: 0 };
      if (path === "/emergency/settings") return { include_blood_group: true, include_allergies: true, include_conditions: false, include_medications: false, include_contacts: true };
      throw new Error(`unexpected ${path}`);
    });
    render(<EmergencyPanel />);
    const start = await screen.findByRole("button", { name: "Start practice run" });
    expect(start).toBeDisabled();
    expect(screen.getByText(/No ambulance is contacted or sent/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/I understand this is a simulation/));
    expect(start).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Start a practice run."));
    expect(start).toBeEnabled();
  });
});
