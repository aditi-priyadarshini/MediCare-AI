import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvidenceList } from "@/components/assistant/EvidenceList";
import {
  activeContext,
  assistantErrorKey,
  CONTEXT_OPTIONS,
  copyableAnswer,
  evidenceHref,
  formatMessageTime,
  isNearBottom,
  modeBadge,
  MODE_NOTE,
  orderEvidence,
  safetyFraming,
  splitCitations,
  SUGGESTED_PROMPTS,
} from "@/lib/assistant";
import { ApiError } from "@/lib/api-client";
import { en } from "@/lib/i18n/en";
import type { ChatMessage, ChatSessionDetail, EvidenceItem } from "@/lib/types";

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

import AssistantPage from "@/app/(app)/assistant/page";

const item = (ref: string, cited: boolean, over: Partial<EvidenceItem> = {}): EvidenceItem => ({
  id: `id-${ref}`,
  ref,
  source_type: "lab_result",
  source_record_id: null,
  source_label: `label ${ref}`,
  recorded_at: "2026-04-12",
  verification_status: "patient_reported",
  cited,
  ...over,
});

describe("citation parsing", () => {
  it("splits text and markers in order", () => {
    expect(splitCitations("Went from 8.2 [E1] to 7.4 [E2].")).toEqual([
      { kind: "text", text: "Went from 8.2 " },
      { kind: "cite", ref: "E1" },
      { kind: "text", text: " to 7.4 " },
      { kind: "cite", ref: "E2" },
      { kind: "text", text: "." },
    ]);
  });
  it("leaves text without markers alone and ignores look-alikes", () => {
    expect(splitCitations("plain [x] [E] text")).toEqual([{ kind: "text", text: "plain [x] [E] text" }]);
    expect(splitCitations("")).toEqual([]);
  });
  it("never produces markup from model text", () => {
    const segs = splitCitations("<img src=x onerror=alert(1)> [E1]");
    expect(segs[0]).toEqual({ kind: "text", text: "<img src=x onerror=alert(1)> " });
  });
});

describe("evidence", () => {
  it("lists used evidence first, each group in numeric order", () => {
    const out = orderEvidence([item("E10", false), item("E2", true), item("E1", false), item("E3", true)]);
    expect(out.map((e) => e.ref)).toEqual(["E2", "E3", "E1", "E10"]);
  });
  it("shows source, date, verification and whether it was used", () => {
    render(<EvidenceList messageId="m1" items={[item("E1", true), item("E2", false, { recorded_at: null })]} />);
    expect(screen.getByText(/What this answer looked at \(2, 1 used\)/)).toBeInTheDocument();
    expect(screen.getByText("Used in the answer", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Looked at, not used", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/no date/)).toBeInTheDocument();
    expect(document.getElementById("ev-m1-E1")).not.toBeNull();
  });
  it("renders nothing when there is no evidence", () => {
    const { container } = render(<EvidenceList messageId="m1" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("wording", () => {
  it("offers exactly the five context switches the server supports", () => {
    expect(CONTEXT_OPTIONS.map((o) => o.key)).toEqual(["medicines", "history", "labs", "doses", "allergies"]);
  });
  it("is honest about whether an AI model wrote the text", () => {
    expect(MODE_NOTE.evidence_only).toMatch(/No AI model wrote this/);
    expect(MODE_NOTE.fallback).toMatch(/did not pass our checks/);
  });
});

/* ------------------------------------------------------------------ Phase E1: helpers */
const msg = (o: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1", role: "assistant", content: "Your HbA1c was 6.1 [E1].", safety_classification: "answered", mode: "llm",
  created_at: "2026-11-17T04:00:00Z", evidence: [item("E1", true)], ...o,
});

describe("lib: answer mode and framing", () => {
  it("claims 'from your records' only when the API returned evidence from the person's records", () => {
    expect(modeBadge(msg())?.key).toBe("assistant.mode.llmRecords");
    const onlyReference = msg({ evidence: [item("E1", true, { source_type: "reference" })] });
    expect(modeBadge(onlyReference)?.key).toBe("assistant.mode.llmNoRecords");
    expect(modeBadge(msg({ evidence: [] }))?.key).toBe("assistant.mode.llmNoRecords");
  });
  it("labels record-listing modes honestly and never as AI-written", () => {
    expect(modeBadge(msg({ mode: "evidence_only" }))).toEqual({ key: "assistant.mode.evidenceOnly", tone: "neutral" });
    expect(modeBadge(msg({ mode: "fallback" }))?.tone).toBe("caution");
    expect(modeBadge(msg({ mode: null }))).toBeNull();
    expect(en["assistant.mode.evidenceOnly"]).toMatch(/Matching records only/);
  });
  it("maps the safety classifications that change framing", () => {
    expect(safetyFraming("urgent_escalation")).toBe("urgent");
    expect(safetyFraming("declined_diagnosis")).toBe("no_diagnosis");
    expect(safetyFraming("declined_treatment")).toBe("no_treatment");
    expect(safetyFraming("answered")).toBeNull();
    expect(safetyFraming(null)).toBeNull();
  });
  it("copies the answer text as returned", () => {
    expect(copyableAnswer(msg({ content: "  text [E1]  " }))).toBe("text [E1]");
  });
});

describe("lib: evidence links, context, errors, time", () => {
  it("links evidence only where a record id and a page exist", () => {
    expect(evidenceHref(item("E1", true, { source_record_id: "r1" }))).toBe("/labs");
    expect(evidenceHref(item("E1", true, { source_record_id: null }))).toBeNull();
    expect(evidenceHref(item("E1", true, { source_type: "reference", source_record_id: "x" }))).toBeNull();
    expect(evidenceHref(item("E1", true, { source_type: "derived", source_record_id: "x" }))).toBeNull();
    expect(evidenceHref(item("E1", true, { source_type: "health_record", source_record_id: "x" }))).toBe("/records");
  });
  it("lists exactly the switches that are on, in display order", () => {
    const none = { medicines: false, history: false, labs: false, doses: false, allergies: false };
    expect(activeContext(none)).toEqual([]);
    expect(activeContext({ ...none, labs: true, medicines: true }).map((o) => o.key)).toEqual(["medicines", "labs"]);
  });
  it("turns the deliberate API errors into translated messages", () => {
    expect(assistantErrorKey(new ApiError(403, "AI_CONTEXT_CONSENT_REQUIRED", "x"))).toBe("assistant.err.consent");
    expect(assistantErrorKey(new ApiError(409, "SESSION_FULL", "x"))).toBe("assistant.err.sessionFull");
    expect(assistantErrorKey(new ApiError(409, "SESSION_LIMIT", "x"))).toBe("assistant.err.sessionLimit");
    expect(assistantErrorKey(new ApiError(429, "RATE", "x"))).toBe("assistant.err.rate");
    expect(assistantErrorKey(new ApiError(500, "HTTP_ERROR", "x"))).toBeNull();
    expect(assistantErrorKey(new Error("net"))).toBeNull();
  });
  it("formats message times in the person's zone and survives a bad zone", () => {
    const iso = "2026-11-17T04:00:00Z";
    expect(formatMessageTime(iso, "Asia/Kolkata", "en")).toMatch(/9:30/);
    expect(formatMessageTime(iso, "Not/AZone", "en")).not.toBe("");
    expect(formatMessageTime("nope", "Asia/Kolkata", "en")).toBe("");
  });
  it("detects whether the reader is at the bottom", () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 520, clientHeight: 400 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 400 })).toBe(false);
  });
  it("suggests only static, generic questions", () => {
    expect(SUGGESTED_PROMPTS).toHaveLength(4);
    for (const k of SUGGESTED_PROMPTS) expect(en[k]).not.toMatch(/\d/);
  });
});

/* ------------------------------------------------------------------ Phase E1: the page */
const NO_CONTEXT = { medicines: false, history: false, labs: false, doses: false, allergies: false };
const session = (o: Partial<ChatSessionDetail> = {}): ChatSessionDetail => ({
  id: "s1", title: "New chat", language: "en", created_at: "2026-11-17T03:00:00Z", updated_at: "2026-11-17T03:00:00Z",
  context: { ...NO_CONTEXT }, consent_granted: true, messages: [], ...o,
});

let status: { mode: "llm" | "evidence_only"; provider: string; model: string | null; consent_granted: boolean; notices: string[] };
let created: ChatSessionDetail;
let onContext: (body: Record<string, boolean>) => Promise<ChatSessionDetail>;
let onAsk: (content: string) => Promise<{ user_message: ChatMessage; assistant_message: ChatMessage }>;

function route() {
  apiMock.mockImplementation(async (path: string, opts?: { method?: string; body?: Record<string, unknown> }) => {
    const base = path.split("?")[0]!;
    if (base === "/assistant/status") return status;
    if (base === "/assistant/sessions" && !opts?.method) return { items: [{ id: "s1", title: "New chat", language: "en", created_at: "", updated_at: "" }] };
    if (base === "/assistant/sessions" && opts?.method === "POST") return created;
    if (base.endsWith("/context")) return onContext(opts!.body as Record<string, boolean>);
    if (base.endsWith("/messages")) return onAsk(String(opts!.body!.content));
    if (opts?.method === "DELETE") return undefined;
    throw new ApiError(404, "NOT_FOUND", "not found");
  });
}

const userMsg = (content: string): ChatMessage => ({ ...msg({ id: "u1", role: "user", content, mode: null, evidence: [], safety_classification: null }) });

async function openChat() {
  const user = userEvent.setup();
  render(<AssistantPage />);
  await user.click(await screen.findByRole("button", { name: "New chat" }));
  await screen.findByRole("log", { name: "Conversation" });
  return user;
}

beforeEach(() => {
  status = { mode: "llm", provider: "x", model: "m", consent_granted: true, notices: [] };
  created = session();
  onContext = async (b) => ({ ...created, context: { ...created.context, ...b } });
  onAsk = async (content) => ({ user_message: userMsg(content), assistant_message: msg() });
  route();
});
afterEach(() => {
  apiMock.mockReset();
  vi.unstubAllGlobals();
});

describe("assistant page", () => {
  it("shows the safety notice before any chat exists and keeps it after one is opened", async () => {
    render(<AssistantPage />);
    expect(await screen.findByRole("note")).toHaveTextContent(/not medical advice/i);
    expect(screen.getByRole("note")).toHaveTextContent(/112/);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "New chat" }));
    await screen.findByRole("log", { name: "Conversation" });
    expect(screen.getByRole("note")).toHaveTextContent(/not medical advice/i);
    expect(screen.getByRole("note")).toHaveTextContent(/112/);
  });

  it("starts a chat with every switch off and says nothing from the records is used", async () => {
    await openChat();
    expect(apiMock).toHaveBeenCalledWith("/assistant/sessions", expect.objectContaining({ method: "POST", body: { language: "en" } }));
    await userEvent.setup().click(screen.getByRole("button", { name: /Records in this chat/ }));
    const dialog = await screen.findByRole("dialog");
    for (const o of CONTEXT_OPTIONS) expect(within(dialog).getByRole("checkbox", { name: new RegExp(en[o.labelKey]) })).not.toBeChecked();
    expect(within(dialog).getByText(/Nothing from your records is shared in this chat/)).toBeInTheDocument();
    expect(screen.getAllByTestId("context-chips")[0]).toHaveTextContent("Using: nothing from your records");
  });

  it("changes the chips only after the API accepted the switch", async () => {
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: /Records in this chat/ }));
    await user.click(await screen.findByRole("checkbox", { name: /My test results/ }));
    await waitFor(() => expect(screen.getAllByTestId("context-chips")[0]).toHaveTextContent("Using: Test results"));
    expect(apiMock).toHaveBeenCalledWith("/assistant/sessions/s1/context", { method: "PATCH", body: { labs: true } });
  });

  it("keeps the chips unchanged and explains when the API refuses a switch (no consent)", async () => {
    onContext = async () => {
      throw new ApiError(403, "AI_CONTEXT_CONSENT_REQUIRED", "raw server text");
    };
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: /Records in this chat/ }));
    await user.click(await screen.findByRole("checkbox", { name: /My allergies/ }));
    expect(await screen.findByText(/can’t use your records yet/)).toBeInTheDocument();
    expect(screen.getAllByTestId("context-chips")[0]).toHaveTextContent("Using: nothing from your records");
    expect(screen.getByRole("checkbox", { name: /My allergies/ })).not.toBeChecked();
  });

  it("disables switching ON without consent, links to the consent setting, and allows switching OFF", async () => {
    created = session({ consent_granted: false, context: { ...NO_CONTEXT, labs: true } });
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: /Records in this chat/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Open privacy settings" })).toHaveAttribute("href", "/profile#privacy");
    expect(within(dialog).getByRole("checkbox", { name: /My medical history/ })).toBeDisabled();
    expect(within(dialog).getByRole("checkbox", { name: /My test results/ })).toBeEnabled();
  });

  it("lists exactly the kinds that are on in 'What the AI can see'", async () => {
    created = session({ context: { ...NO_CONTEXT, medicines: true, allergies: true } });
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: /Records in this chat/ }));
    const dialog = await screen.findByRole("dialog");
    const box = within(dialog).getByRole("heading", { name: "What the AI can see" }).closest("section")!;
    expect(within(box).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["My current medicines", "My allergies"]);
  });

  it("shows a working state while waiting, with no fake typing, then the answer", async () => {
    let finish!: () => void;
    onAsk = (content) =>
      new Promise((resolve) => {
        finish = () => resolve({ user_message: userMsg(content), assistant_message: msg() });
      });
    const user = await openChat();
    await user.type(screen.getByLabelText("Your question"), "How is my HbA1c?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Working on your answer…")).toBeInTheDocument();
    expect(screen.getByText("Sending…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
    finish();
    expect(await screen.findByText(/Your HbA1c was 6.1/)).toBeInTheDocument();
    expect(screen.queryByText("Working on your answer…")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).toHaveValue("");
    await waitFor(() => expect(screen.getByLabelText("Your question")).toHaveFocus());
  });

  it("sends on Enter, adds a new line on Shift+Enter, and never sends an empty question", async () => {
    const user = await openChat();
    const box = screen.getByLabelText("Your question");
    await user.type(box, "first{Shift>}{Enter}{/Shift}second");
    expect(box).toHaveValue("first\nsecond");
    expect(apiMock).not.toHaveBeenCalledWith(expect.stringContaining("/messages"), expect.anything());
    await user.type(box, "{Enter}");
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/assistant/sessions/s1/messages", { method: "POST", body: { content: "first\nsecond" } }));
    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
  });

  it("fills the composer from a suggestion but does not send it", async () => {
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: en["assistant.prompt.2"] }));
    expect(screen.getByLabelText("Your question")).toHaveValue(en["assistant.prompt.2"]);
    expect(apiMock).not.toHaveBeenCalledWith(expect.stringContaining("/messages"), expect.anything());
  });

  it("keeps the question and offers a retry when sending fails", async () => {
    onAsk = async () => {
      throw new ApiError(429, "RATE_LIMITED", "slow down");
    };
    const user = await openChat();
    await user.type(screen.getByLabelText("Your question"), "again?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/too many questions/)).toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).toHaveValue("again?");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("renders answers with only the evidence the API returned and the mode it reports", async () => {
    onAsk = async (content) => ({
      user_message: userMsg(content),
      assistant_message: msg({ content: "Seen in [E1] and also [E9].", evidence: [item("E1", true, { source_record_id: "lab1" }), item("E2", false)] }),
    });
    const user = await openChat();
    await user.type(screen.getByLabelText("Your question"), "q{Enter}");
    expect(await screen.findByText("Written with AI from your records")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Source E1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Source E9" })).not.toBeInTheDocument();
    expect(screen.getByText(/\[E9\]/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Source E1" }));
    const row = document.getElementById("ev-m1-E1")!;
    expect(row).toHaveTextContent("label E1");
    expect(within(row).getByRole("link", { name: "Open Lab results" })).toHaveAttribute("href", "/labs");
    expect(document.getElementById("ev-m1-E2")).toHaveTextContent("Looked at, not used");
    expect(document.getElementById("ev-m1-E3")).toBeNull();
  });

  it("says plainly when only matching records were listed", async () => {
    onAsk = async (content) => ({ user_message: userMsg(content), assistant_message: msg({ mode: "evidence_only", content: "Listed records." }) });
    const user = await openChat();
    await user.type(screen.getByLabelText("Your question"), "q{Enter}");
    expect(await screen.findByText("Matching records only (AI unavailable)")).toBeInTheDocument();
    expect(screen.getByText("Listed from your records. No AI model wrote this.")).toBeInTheDocument();
    expect(screen.queryByText(/Written with AI/)).not.toBeInTheDocument();
  });

  it("shows the connection notice when no AI model is configured", async () => {
    status = { ...status, mode: "evidence_only" };
    render(<AssistantPage />);
    expect(await screen.findByText("No AI model is connected")).toBeInTheDocument();
  });

  it("puts Call 112 and the emergency page on an urgent answer", async () => {
    onAsk = async (content) => ({
      user_message: userMsg(content),
      assistant_message: msg({ safety_classification: "urgent_escalation", mode: "canned", content: "Get help now.", evidence: [] }),
    });
    const user = await openChat();
    await user.type(screen.getByLabelText("Your question"), "chest pain{Enter}");
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("link", { name: /Call 112/ })).toHaveAttribute("href", "tel:112");
    expect(within(alert).getByRole("link", { name: "Open the emergency page" })).toHaveAttribute("href", "/emergency");
  });

  it("copies an answer and says so", async () => {
    const user = await openChat();
    // user-event installs its own clipboard on setup(), so replace it afterwards.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.type(screen.getByLabelText("Your question"), "q{Enter}");
    await user.click(await screen.findByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("Your HbA1c was 6.1 [E1].");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("tells the person when copying is not possible", async () => {
    const user = await openChat();
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await user.type(screen.getByLabelText("Your question"), "q{Enter}");
    await user.click(await screen.findByRole("button", { name: "Copy" }));
    expect(await screen.findByText(/Copy did not work/)).toBeInTheDocument();
  });

  it("does not offer read-aloud when voice is off in the profile", async () => {
    const user = await openChat();
    await user.type(screen.getByLabelText("Your question"), "q{Enter}");
    await screen.findByText(/Your HbA1c was 6.1/);
    expect(screen.queryByRole("button", { name: "Read aloud" })).not.toBeInTheDocument();
  });

  it("offers read-aloud on answers when voice is on in the profile", async () => {
    prof.profile.accessibility_preferences.voice_enabled = true;
    try {
      const user = await openChat();
      await user.type(screen.getByLabelText("Your question"), "q{Enter}");
      await screen.findByText(/Your HbA1c was 6.1/);
      expect(screen.getByRole("button", { name: "Read aloud" })).toBeInTheDocument();
    } finally {
      prof.profile.accessibility_preferences.voice_enabled = false;
    }
  });

  it("asks before deleting a chat and deletes only after confirming", async () => {
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Delete this chat" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(apiMock).not.toHaveBeenCalledWith("/assistant/sessions/s1", expect.objectContaining({ method: "DELETE" }));
    await user.click(within(dialog).getByRole("button", { name: "Delete chat" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/assistant/sessions/s1", { method: "DELETE" }));
    expect(await screen.findByText("Start a chat")).toBeInTheDocument();
  });

  it("shows an error state with a retry when the chats cannot be loaded", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/assistant/sessions")) throw new ApiError(500, "HTTP_ERROR", "boom");
      return status;
    });
    render(<AssistantPage />);
    expect(await screen.findByText("Couldn’t load the assistant")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("has no axe violations with a conversation open", async () => {
    const user = await openChat();
    await user.type(screen.getByLabelText("Your question"), "q{Enter}");
    await screen.findByText(/Your HbA1c was 6.1/);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe("assistant text parity", () => {
  it("has English, Hindi and Odia for every context switch", async () => {
    const { hi } = await import("@/lib/i18n/hi");
    const { or } = await import("@/lib/i18n/or");
    for (const o of CONTEXT_OPTIONS) for (const k of [o.labelKey, o.hintKey, o.chipKey]) {
      expect(hi[k], k).toBeTruthy();
      expect(or[k], k).toBeTruthy();
    }
  });
});
