import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { existsSync } from "node:fs";
import path from "node:path";
import { configureAxe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import { beforeEach, describe, expect, it, vi } from "vitest";

expect.extend(axeMatchers);
const axe = configureAxe({ rules: { region: { enabled: false } } });
declare module "vitest" {
  interface Assertion {
    toHaveNoViolations(): void;
  }
}

// ---- mocks -----------------------------------------------------------------------------------
const nav = vi.hoisted(() => ({ pathname: "/dashboard", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const auth = vi.hoisted(() => ({ role: "patient" as "patient" | "admin", logout: vi.fn(async () => {}) }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { role: auth.role, display_name: "Asha", email: "a@x.in" }, logout: auth.logout }),
}));

const prof = vi.hoisted(() => ({
  save: vi.fn(async (i: unknown) => i),
  profile: {
    display_name: "Asha", date_of_birth: null, preferred_language: "en", timezone: "Asia/Kolkata", height_cm: null, weight_kg: null,
    blood_group: null, onboarding_completed: true, completeness: 0,
    accessibility_preferences: { large_text: false, high_contrast: false, reduce_motion: false, voice_enabled: false },
  },
}));
vi.mock("@/lib/profile-context", async (orig) => {
  const real = await orig<typeof import("@/lib/profile-context")>();
  const value = { profile: prof.profile, save: prof.save, reload: vi.fn() };
  return { ...real, useProfile: () => value, useOptionalProfile: () => value };
});

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", async (orig) => ({ ...(await orig<typeof import("@/lib/api-client")>()), api: apiMock }));

import SettingsPage from "@/app/(app)/settings/page";
import { AppShell } from "@/components/layout/AppShell";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { NotificationPanel } from "@/components/layout/NotificationPanel";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ExperienceProvider } from "@/lib/experience";
import { I18nProvider } from "@/lib/i18n";
import { ADMIN_PAGES, MOBILE_PRIMARY, NAV_ROUTES, breadcrumbsFor, groupedRoutes } from "@/lib/nav";

const note = (over: Partial<{ id: string; title: string; read_at: string | null }> = {}) => ({
  id: "n1", kind: "dose_due", title: "Dose due", body: "Time for your tablet", due_at: "2026-11-17T08:00:00Z",
  delivered_at: null, read_at: null, dose_log_id: null, medication_id: null, ...over,
});

let notes: ReturnType<typeof note>[];
beforeEach(() => {
  nav.pathname = "/dashboard";
  nav.push.mockClear();
  auth.role = "patient";
  prof.save.mockClear();
  window.localStorage.clear();
  notes = [note()];
  apiMock.mockReset();
  apiMock.mockImplementation(async (p: string, o?: { method?: string }) => {
    if (p.startsWith("/notifications/unread-count")) return { count: notes.filter((n) => !n.read_at).length };
    if (p.startsWith("/notifications?")) return { items: notes, total: notes.length, limit: 20, offset: 0 };
    if (p === "/notifications/read-all") { notes = notes.map((n) => ({ ...n, read_at: "x" })); return; }
    if (p.endsWith("/read") && o?.method === "POST") { notes = notes.map((n) => ({ ...n, read_at: "x" })); return; }
    return undefined;
  });
});

const shell = () =>
  render(
    <ExperienceProvider>
      <I18nProvider language="en">
        <AppShell>
          <h1>Page</h1>
        </AppShell>
      </I18nProvider>
    </ExperienceProvider>,
  );

// ---- route config ---------------------------------------------------------------------------
describe("route config", () => {
  it("only lists routes that exist and never repeats an href", () => {
    const hrefs = NAV_ROUTES.map((r) => r.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of [...hrefs, ...ADMIN_PAGES.map((p) => p.href)]) {
      const dir = path.join(process.cwd(), "app", "(app)", href);
      expect(existsSync(path.join(dir, "page.tsx")), href).toBe(true);
    }
  });
  it("has four primary mobile slots", () => expect(MOBILE_PRIMARY).toHaveLength(4));
  it("shows the admin group only to administrators", () => {
    expect(groupedRoutes(false).map((g) => g.id)).not.toContain("admin");
    expect(groupedRoutes(true).map((g) => g.id)).toContain("admin");
  });
  it("gives only nested admin pages a breadcrumb", () => {
    expect(breadcrumbsFor("/dashboard")).toEqual([]);
    expect(breadcrumbsFor("/admin")).toEqual([]);
    expect(breadcrumbsFor("/admin/rules").map((c) => c.label)).toEqual(["Admin", "Safety rules"]);
  });
});

// ---- shell ----------------------------------------------------------------------------------
describe("AppShell", () => {
  it("renders every route link with its href, marks the current page, and hides Admin from patients", () => {
    shell();
    const side = screen.getByRole("navigation", { name: "Main" });
    for (const r of NAV_ROUTES.filter((r) => !r.adminOnly)) {
      const link = within(side).getAllByRole("link").find((a) => a.getAttribute("href") === r.href);
      expect(link, r.href).toBeTruthy();
    }
    expect(within(side).queryByRole("link", { name: "Admin" })).toBeNull();
    expect(within(side).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("shows Admin to administrators", () => {
    auth.role = "admin";
    shell();
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("keeps Emergency as a visible link to /emergency", () => {
    shell();
    expect(screen.getByRole("link", { name: /emergency/i })).toHaveAttribute("href", "/emergency");
  });

  it("has no axe violations", async () => {
    const { container } = shell();
    await waitFor(() => expect(screen.getByRole("button", { name: /Notifications, 1 unread/ })).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });

  it("collapses the sidebar, keeps names, and remembers the choice", async () => {
    const first = shell();
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(window.localStorage.getItem("medicare.sidebar")).toBe("collapsed");
    expect(first.container.querySelector("aside")).toHaveAttribute("data-collapsed", "true");
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    first.unmount();
    const second = shell();
    await waitFor(() => expect(second.container.querySelector("aside")).toHaveAttribute("data-collapsed", "true"));
  });

  it("survives blocked storage", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    shell();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
    spy.mockRestore();
  });
});

// ---- mobile ---------------------------------------------------------------------------------
describe("MobileNavigation", () => {
  const mobile = () => render(<I18nProvider language="en"><MobileNavigation isAdmin={false} /></I18nProvider>);

  it("has at most five items in the bar", () => {
    mobile();
    const bar = screen.getByRole("navigation", { name: "Quick links" });
    expect(within(bar).getAllByRole("link").length + within(bar).getAllByRole("button").length).toBeLessThanOrEqual(5);
  });

  it("opens the drawer with the full list and closes on Escape, returning focus", async () => {
    mobile();
    const more = screen.getByRole("button", { name: "More" });
    await userEvent.click(more);
    const drawer = screen.getByRole("dialog", { name: "Menu" });
    expect(within(drawer).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(within(drawer).getByRole("link", { name: "Feedback" })).toHaveAttribute("href", "/feedback");
    expect(within(drawer).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(more).toHaveFocus();
  });
});

// ---- command palette ------------------------------------------------------------------------
describe("command palette", () => {
  it("opens with Ctrl+K, filters, moves with arrows, goes with Enter, closes with Escape", async () => {
    shell();
    await userEvent.keyboard("{Control>}k{/Control}");
    const box = screen.getByRole("combobox");
    expect(box).toHaveFocus();
    await userEvent.type(box, "medic");
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(1);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}{Enter}");
    expect(nav.push).toHaveBeenCalledWith("/medications");
    expect(screen.queryByRole("combobox")).toBeNull();

    await userEvent.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("says plainly that it does not search health records, and handles no match", async () => {
    shell();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByText(/does not search your health records/i)).toBeInTheDocument();
    await userEvent.type(screen.getByRole("combobox"), "zzzz");
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });
});

// ---- notifications --------------------------------------------------------------------------
describe("NotificationPanel", () => {
  const panel = () => render(<I18nProvider language="en"><NotificationPanel /></I18nProvider>);

  it("shows the unread count, marks one read, and the count drops", async () => {
    panel();
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    await userEvent.click(bell);
    expect(await screen.findByText("Dose due")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mark “Dose due” as read" }));
    expect(apiMock).toHaveBeenCalledWith("/notifications/n1/read", { method: "POST" });
    await screen.findByRole("button", { name: "Notifications" });
    expect(screen.queryByRole("button", { name: /Mark “Dose due”/ })).toBeNull();
  });

  it("marks all read", async () => {
    notes = [note(), note({ id: "n2", title: "Refill" })];
    panel();
    await userEvent.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));
    await userEvent.click(await screen.findByRole("button", { name: "Mark all read" }));
    expect(apiMock).toHaveBeenCalledWith("/notifications/read-all", { method: "POST" });
    await screen.findByRole("button", { name: "Notifications" });
  });

  it("shows an empty state", async () => {
    notes = [];
    panel();
    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("No notifications yet.")).toBeInTheDocument();
  });

  it("shows an error state with retry", async () => {
    apiMock.mockRejectedValue(new Error("down"));
    panel();
    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Notifications could not be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the bell", async () => {
    panel();
    const bell = await screen.findByRole("button", { name: /Notifications/ });
    await userEvent.click(bell);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bell).toHaveFocus();
  });
});

// ---- breadcrumbs ----------------------------------------------------------------------------
describe("Breadcrumbs", () => {
  it("renders nothing on top-level pages and a trail on admin sub-pages", () => {
    const { container, rerender } = render(<I18nProvider language="en"><Breadcrumbs /></I18nProvider>);
    expect(container).toBeEmptyDOMElement();
    nav.pathname = "/admin/audit";
    rerender(<I18nProvider language="en"><Breadcrumbs /></I18nProvider>);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByText("Audit log")).toHaveAttribute("aria-current", "page");
  });
});

// ---- settings -------------------------------------------------------------------------------
describe("Settings page", () => {
  const page = () => render(<ExperienceProvider><I18nProvider language="en"><SettingsPage /></I18nProvider></ExperienceProvider>);

  it("saves a toggle through the profile path, keeping every other field", async () => {
    page();
    await userEvent.click(screen.getByRole("switch", { name: "Larger text" }));
    expect(prof.save).toHaveBeenCalledWith(expect.objectContaining({
      display_name: "Asha",
      accessibility_preferences: { large_text: true, high_contrast: false, reduce_motion: false, voice_enabled: false },
    }));
  });

  it("saves the language", async () => {
    page();
    await userEvent.selectOptions(screen.getByLabelText("Preferred language"), "hi");
    expect(prof.save).toHaveBeenCalledWith(expect.objectContaining({ preferred_language: "hi" }));
  });

  it("reports a failed save", async () => {
    prof.save.mockRejectedValueOnce(new Error("x"));
    page();
    await userEvent.click(screen.getByRole("switch", { name: "High contrast" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
  });

  it("switches reading mode and applies data-experience", async () => {
    page();
    await userEvent.click(screen.getByRole("radio", { name: /Easy-read/ }));
    await waitFor(() => expect(document.documentElement.dataset.experience).toBe("easy"));
    expect(window.localStorage.getItem("medicare.experience")).toBe("easy");
  });

  it("links to Profile and Feedback and has no axe violations", async () => {
    const { container } = page();
    expect(screen.getByRole("link", { name: "Open Health Profile" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("link", { name: "Send feedback" })).toHaveAttribute("href", "/feedback");
    await act(async () => {});
    expect(await axe(container)).toHaveNoViolations();
  });
});
