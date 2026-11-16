import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountsTable } from "@/components/admin/AccountsTable";
import { AdminOverviewCard } from "@/components/admin/AdminOverviewCard";
import { AuditLogView } from "@/components/admin/AuditLogView";
import { FeedbackModeration } from "@/components/admin/FeedbackModeration";
import { ReferenceData } from "@/components/admin/ReferenceData";
import { RulesManager } from "@/components/admin/RulesManager";
import AdminLayout from "@/app/(app)/admin/layout";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import type { AdminRule } from "@/lib/admin";

expect.extend(axeMatchers);
// Components render as fragments here; page landmarks come from AppShell (<main>, <nav>), so the
// page-level "region" rule does not apply to them. Every other rule stays on.
const axe = configureAxe({ rules: { region: { enabled: false } } });
declare module "vitest" {
  interface Assertion {
    toHaveNoViolations(): void;
  }
}

const api = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  api: (...args: unknown[]) => api(...args),
}));

let role = "admin";
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "me-1", role, email: "me@example.com", display_name: "Me", email_verified: true } }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin", useRouter: () => ({ replace: vi.fn() }) }));

const page = <T,>(items: T[]) => ({ items, total: items.length, limit: 50, offset: 0 });

const rule = (over: Partial<AdminRule> = {}): AdminRule => ({
  id: "r1",
  kind: "drug_drug",
  ingredient_id: "i1",
  counterpart_ingredient_id: "i2",
  counterpart_term: null,
  severity: "moderate",
  description: "May raise levels of the other medicine.",
  clinical_significance: null,
  guidance: null,
  source_id: "s1",
  source_version: "v1",
  reviewed_at: "2026-11-01",
  jurisdiction: "IN",
  status: "active",
  retired_at: null,
  created_at: "2026-11-02T10:00:00Z",
  version: 1,
  supersedes_rule_id: null,
  review_status: "unreviewed",
  reviewed_by_user_id: null,
  peer_reviewed_at: null,
  created_by_user_id: "other-admin",
  ...over,
});

const refs = (path: string) => {
  if (path.startsWith("/admin/ingredients")) return page([{ id: "i1", name: "Alpha" }, { id: "i2", name: "Beta" }]);
  if (path.startsWith("/admin/sources"))
    return page([{ id: "s1", name: "Rulebook", publisher: null, url: null, licence: null, jurisdiction: "IN", version: "v1", reviewed_at: "2026-11-01" }]);
  return undefined;
};

beforeEach(() => {
  api.mockReset();
  role = "admin";
});

describe("admin area gate", () => {
  it("shows nothing but a notice to a patient", () => {
    role = "patient";
    render(<AdminLayout>secret console</AdminLayout>);
    expect(screen.getByText("This area is for administrators.")).toBeInTheDocument();
    expect(screen.queryByText("secret console")).not.toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("states that admins cannot open health records", async () => {
    render(<AdminLayout>child</AdminLayout>);
    expect(screen.getByText(/cannot open patients’ health records/)).toBeInTheDocument();
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe("overview", () => {
  it("shows counts and flags what needs attention", async () => {
    api.mockResolvedValue({ users: 5, inactive_users: 1, feedback_new: 2, rules_active: 14, rules_unreviewed: 14, sources: 1, medicines: 20 });
    const { container } = render(<AdminOverviewCard />);
    expect(await screen.findByText("Rules awaiting second-person review")).toBeInTheDocument();
    expect(screen.getAllByText("Needs attention")).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows an error, not zeros, when the request fails", async () => {
    api.mockRejectedValue(new Error("down"));
    render(<AdminOverviewCard />);
    expect(await screen.findByText("Could not load the overview")).toBeInTheDocument();
  });
});

describe("audit log", () => {
  const rows = [
    { id: "a1", actor_user_id: "abcdef12-0000", action: "admin.rule_create", resource_type: "safety_rule", resource_id: "r1234567-x", ip: null, request_id: null, metadata: { rows: 3 }, created_at: "2026-11-16T09:00:00Z" },
  ];

  it("lists events, filters by type and states what is excluded", async () => {
    api.mockResolvedValue({ items: rows, total: 1, limit: 25, offset: 0 });
    const user = userEvent.setup();
    const { container } = render(<AuditLogView />);
    expect(await screen.findByText("Rule create")).toBeInTheDocument();
    expect(screen.getByText(/not shown here/)).toBeInTheDocument();
    expect(screen.getByText("Showing 1–1 of 1")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Type of event"), "admin.");
    await waitFor(() => expect(api.mock.calls.at(-1)![0]).toContain("action=admin."));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows an empty state", async () => {
    api.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });
    render(<AuditLogView />);
    expect(await screen.findByText("No events match")).toBeInTheDocument();
  });
});

describe("feedback moderation", () => {
  const item = {
    id: "f1", user_id: "u1234567-0", category: "bug", message: "<img src=x onerror=alert(1)> broken", page: "/labs",
    status: "new", moderator_note: null, moderated_by_user_id: null, moderated_at: null, created_at: "2026-11-15T10:00:00Z",
  };

  it("shows message text as text, never markup, and no sender identity beyond an id prefix", async () => {
    api.mockResolvedValue(page([item]));
    const { container } = render(<FeedbackModeration />);
    expect(await screen.findByText(/<img src=x onerror=alert\(1\)> broken/)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("sends the chosen status and the internal note", async () => {
    api.mockResolvedValue(page([item]));
    const user = userEvent.setup();
    render(<FeedbackModeration />);
    await user.type(await screen.findByLabelText(/Internal note/), "Logged as #12");
    await user.click(screen.getByRole("button", { name: "Mark as acted on" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/admin/feedback/f1/moderate", {
        method: "POST",
        body: { status: "actioned", note: "Logged as #12" },
      }),
    );
  });
});

describe("accounts", () => {
  const users = [
    { id: "me-1", email: "me@example.com", role: "admin", is_active: true, email_verified: true, created_at: "2026-01-01T00:00:00Z" },
    { id: "u2", email: "pat@example.com", role: "patient", is_active: true, email_verified: true, created_at: "2026-02-01T00:00:00Z" },
    { id: "u3", email: "gone@example.com", role: "patient", is_active: false, email_verified: false, created_at: "2026-03-01T00:00:00Z" },
  ];

  it("offers no action on your own row and asks before deactivating", async () => {
    api.mockResolvedValue({ items: users, total: 3, limit: 25, offset: 0 });
    const user = userEvent.setup();
    const { container } = render(<AccountsTable />);
    expect(await screen.findByText("This is you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reactivate/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Deactivate pat@example.com" }));
    expect(api).toHaveBeenCalledTimes(1); // nothing sent yet
    await user.click(screen.getByRole("button", { name: /Yes, deactivate/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/admin/users/u2/deactivate", { method: "POST" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("safety rules", () => {
  function mockRules(items: AdminRule[]) {
    api.mockImplementation(async (path: string) => refs(path) ?? page(items));
  }

  it("offers second-person approval only on someone else's rule", async () => {
    mockRules([rule({ id: "theirs" }), rule({ id: "mine", created_by_user_id: "me-1", ingredient_id: "i2", counterpart_ingredient_id: "i1" })]);
    const { container } = render(<RulesManager />);
    await screen.findAllByText("Awaiting second-person review");
    expect(screen.getAllByRole("button", { name: "Approve as second reviewer" })).toHaveLength(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("does not offer approval on an already-approved or retired rule", async () => {
    mockRules([rule({ review_status: "approved" }), rule({ id: "old", status: "retired" })]);
    render(<RulesManager />);
    await screen.findByText("Reviewed by a second administrator");
    expect(screen.queryByRole("button", { name: "Approve as second reviewer" })).not.toBeInTheDocument();
    expect(within(screen.getAllByRole("list")[0]!).getByText("Replaced or retired")).toBeInTheDocument();
  });

  it("retiring needs a second click", async () => {
    mockRules([rule()]);
    const user = userEvent.setup();
    render(<RulesManager />);
    await user.click(await screen.findByRole("button", { name: "Retire" }));
    expect(api.mock.calls.some((c) => String(c[0]).endsWith("/retire"))).toBe(false);
    await user.click(screen.getByRole("button", { name: "Yes, retire this rule" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/admin/safety-rules/r1/retire", { method: "POST" }));
  });

  it("writing a new version posts to supersede with the kind fixed", async () => {
    mockRules([rule()]);
    const user = userEvent.setup();
    render(<RulesManager />);
    await user.click(await screen.findByRole("button", { name: "Write a new version" }));
    expect(screen.getByLabelText("Kind of rule")).toBeDisabled();
    expect(screen.getByText(/Nothing is overwritten/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Severity"), "major");
    await user.click(screen.getByRole("button", { name: "Save new version" }));
    await waitFor(() => {
      const call = api.mock.calls.find((c) => String(c[0]).endsWith("/supersede"));
      expect(call?.[0]).toBe("/admin/safety-rules/r1/supersede");
      expect((call?.[1] as { body: { severity: string } }).body.severity).toBe("major");
    });
  });

  it("the new-rule form passes accessibility checks", async () => {
    mockRules([]);
    const user = userEvent.setup();
    const { container } = render(<RulesManager />);
    await user.click(await screen.findByRole("button", { name: "Add a rule" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("reference data", () => {
  it("lists sources and catalogue and passes accessibility checks", async () => {
    api.mockImplementation(async (path: string) =>
      refs(path) ?? page([{ id: "m1", name: "Zorbex", form: "tablet", strength_text: "5 mg", source: "admin" }]),
    );
    const { container } = render(<ReferenceData />);
    expect(await screen.findByText("Rulebook")).toBeInTheDocument();
    expect(await screen.findByText("Zorbex")).toBeInTheDocument();
    expect(screen.getByText(/No dosing or advice/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("patient feedback form", () => {
  it("blocks a too-short message, sends the category and text only, then thanks the sender", async () => {
    api.mockImplementation(async (path: string, opts?: { method?: string }) =>
      opts?.method === "POST" ? { id: "f" } : page([]),
    );
    const user = userEvent.setup();
    const { container } = render(<FeedbackForm />);
    const send = await screen.findByRole("button", { name: "Send feedback" });
    expect(send).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("What is it about?"), "accessibility");
    await user.type(screen.getByLabelText("Your message"), "Buttons are small on my phone");
    expect(send).toBeEnabled();
    await user.click(send);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/feedback", {
        method: "POST",
        body: { category: "accessibility", message: "Buttons are small on my phone" },
      }),
    );
    expect(await screen.findByText("Your feedback was sent.")).toBeInTheDocument();
    expect(screen.getByText(/call 112/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows the sender's own history with plain status words and no moderator note", async () => {
    api.mockResolvedValue(
      page([{ id: "f1", category: "bug", message: "It crashed", page: null, status: "actioned", created_at: "2026-11-10T10:00:00Z" }]),
    );
    render(<FeedbackForm />);
    const list = await screen.findByRole("list");
    expect(within(list).getByText(/Acted on/)).toBeInTheDocument();
    expect(within(list).getByText("It crashed")).toBeInTheDocument();
  });
});
