import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/onboarding" }));

const prof = vi.hoisted(() => ({
  save: vi.fn(async (i: unknown) => i),
  reload: vi.fn(async () => {}),
  profile: {
    display_name: "", date_of_birth: null, preferred_language: "en", timezone: "Asia/Kolkata", height_cm: null, weight_kg: null,
    blood_group: null, onboarding_completed: false, completeness: 0,
    accessibility_preferences: { large_text: false, high_contrast: false, reduce_motion: false, voice_enabled: false },
  },
}));
vi.mock("@/lib/profile-context", async (orig) => {
  const real = await orig<typeof import("@/lib/profile-context")>();
  const value = { profile: prof.profile, save: prof.save, reload: prof.reload };
  return { ...real, useProfile: () => value, useOptionalProfile: () => value };
});

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", async (orig) => ({ ...(await orig<typeof import("@/lib/api-client")>()), api: apiMock }));

import OnboardingPage from "@/app/(app)/onboarding/page";
import { ApiError } from "@/lib/api-client";
import { ExperienceProvider } from "@/lib/experience";

const empty = { items: [], total: 0, limit: 50, offset: 0 };
const renderPage = () => render(<ExperienceProvider><OnboardingPage /></ExperienceProvider>);
const heading = () => screen.getByRole("heading", { level: 1 });
const consentCalls = () => apiMock.mock.calls.filter(([p]) => String(p).startsWith("/consents"));

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-experience");
  router.replace.mockClear();
  prof.save.mockReset().mockImplementation(async (i: unknown) => i);
  prof.reload.mockClear();
  apiMock.mockReset().mockImplementation(async (path: string, opts?: { method?: string }) => (opts?.method === "PUT" ? {} : empty));
});

async function toStep(user: ReturnType<typeof userEvent.setup>, n: number, name = "Asha") {
  await user.click(screen.getByRole("button", { name: "Get started" }));
  if (n === 1) return;
  await user.type(screen.getByLabelText("Full name"), name);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  if (n === 2) return;
  await user.click(screen.getByRole("button", { name: "Continue" })); // access -> health
  if (n === 3) return;
  await user.click(screen.getByRole("button", { name: "Skip for now" })); // health -> contact
  if (n === 4) return;
  await user.click(screen.getByRole("button", { name: "Skip for now" })); // contact -> privacy
}

describe("welcome step", () => {
  it("explains what the app does and does not do, with no medical claims or API calls", () => {
    renderPage();
    expect(heading()).toHaveTextContent("Welcome to MediCare AI");
    expect(screen.getByText("What it does")).toBeInTheDocument();
    expect(screen.getByText(/does not diagnose, prescribe or replace a doctor/)).toBeInTheDocument();
    expect(screen.getByText(/private by default/i)).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
    expect(prof.save).not.toHaveBeenCalled();
  });

  it("shows named steps with the current one marked, and Back is unavailable", () => {
    renderPage();
    const list = screen.getByRole("list", { name: "Progress" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(within(list).getByText("Language & access")).toBeInTheDocument();
    expect(list.querySelector('[aria-current="step"]')).toHaveTextContent("Welcome");
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });
});

describe("basics step", () => {
  it("blocks continuing without a name, announces it and focuses the field", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Get started" }));
    expect(heading()).toHaveTextContent("Basics");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please check the highlighted fields.");
    expect(screen.getByText("Enter your name.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Full name")).toHaveFocus());
    expect(prof.save).not.toHaveBeenCalled();
    expect(heading()).toHaveTextContent("Basics");
  });

  it("focuses the first invalid field when several are wrong", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Get started" }));
    await user.type(screen.getByLabelText("Full name"), "Asha");
    await user.type(screen.getByLabelText(/Height/), "500");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByLabelText(/Height/)).toHaveFocus());
    expect(screen.getByText("Enter height in cm (30–272).")).toBeInTheDocument();
  });

  it("explains why it asks and that only the name is required", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Get started" }));
    expect(screen.getByText(/We ask for your name so the app can greet you/)).toBeInTheDocument();
    expect(screen.getByText("Only your name is required.")).toBeInTheDocument();
  });

  it("saves the profile with the existing call and moves on", async () => {
    const user = userEvent.setup();
    renderPage();
    await toStep(user, 2);
    expect(prof.save).toHaveBeenCalledTimes(1);
    expect(prof.save).toHaveBeenCalledWith(expect.objectContaining({ display_name: "Asha" }));
    expect(heading()).toHaveTextContent("Language & access");
  });

  it("shows the server's message and stays put when saving fails", async () => {
    prof.save.mockRejectedValueOnce(new ApiError(500, "HTTP_ERROR", "We couldn’t save that."));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Get started" }));
    await user.type(screen.getByLabelText("Full name"), "Asha");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("We couldn’t save that.")).toBeInTheDocument();
    expect(heading()).toHaveTextContent("Basics");
  });
});

describe("navigation keeps data", () => {
  it("keeps typed values when going back and forward", async () => {
    const user = userEvent.setup();
    renderPage();
    await toStep(user, 2, "Asha Rao");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(heading()).toHaveTextContent("Basics");
    expect(screen.getByLabelText("Full name")).toHaveValue("Asha Rao");
  });

  it("keeps half-typed text in the optional steps", async () => {
    const user = userEvent.setup();
    renderPage();
    await toStep(user, 3);
    await user.type(screen.getByLabelText("Add a condition"), "Asthma");
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(heading()).toHaveTextContent("Emergency contact");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(heading()).toHaveTextContent("Conditions & allergies");
    expect(screen.getByLabelText("Add a condition")).toHaveValue("Asthma");
  });

  it("moves focus to the step heading", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Get started" }));
    await waitFor(() => expect(heading()).toHaveFocus());
  });

  it("animates in the direction of travel", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Get started" }));
    expect(screen.getByLabelText("Full name").closest(".step-forward")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(document.querySelector(".step-back")).not.toBeNull();
  });
});

describe("access step", () => {
  it("previews large text and high contrast before saving, in words as well", async () => {
    const user = userEvent.setup();
    renderPage();
    await toStep(user, 2);
    const preview = screen.getByTestId("access-preview");
    expect(preview).toHaveClass("text-base");
    expect(screen.getByText("Text size: standard")).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Larger text/i));
    await user.click(screen.getByLabelText(/High contrast/i));
    expect(preview).toHaveClass("text-xl");
    expect(preview).toHaveClass("bg-white");
    expect(screen.getByText("Text size: large")).toBeInTheDocument();
    expect(screen.getByText("Contrast: high")).toBeInTheDocument();
    expect(prof.save).toHaveBeenCalledTimes(1); // only the basics step so far
  });

  it("saves the choices through the profile on Continue", async () => {
    const user = userEvent.setup();
    renderPage();
    await toStep(user, 2);
    await user.click(screen.getByLabelText(/Reduce motion/i));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(prof.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ accessibility_preferences: expect.objectContaining({ reduce_motion: true }) }),
    );
    expect(heading()).toHaveTextContent("Conditions & allergies");
  });

  it("lets the person choose Easy-read, which applies at once", async () => {
    const user = userEvent.setup();
    renderPage();
    await toStep(user, 2);
    await user.click(screen.getByRole("radio", { name: /Easy-read/i }));
    expect(document.documentElement.dataset.experience).toBe("easy");
  });
});

describe("optional steps", () => {
  it("say they are optional and can be skipped", async () => {
    const user = userEvent.setup();
    renderPage();
    await toStep(user, 3);
    expect(screen.getByText("This step is optional.")).toBeInTheDocument();
    expect(screen.getByText(/appear on your emergency summary/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(heading()).toHaveTextContent("Emergency contact");
    expect(screen.getByText("This step is optional.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(heading()).toHaveTextContent("Privacy");
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
  });
});

describe("privacy step", () => {
  it("cannot finish without the three required consents", async () => {
    const user = userEvent.setup();
    renderPage();
    await toStep(user, 5);
    await user.click(screen.getByRole("checkbox", { name: /terms of service/ }));
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please accept the three required items to continue.");
    expect(consentCalls()).toHaveLength(0);
    expect(prof.reload).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /privacy policy/ })).toHaveFocus());
  });

  it("records only the required consents, then reloads and goes to the dashboard", async () => {
    const user = userEvent.setup();
    renderPage();
    await toStep(user, 5);
    for (const name of [/terms of service/, /privacy policy/, /Store my health information/]) {
      await user.click(screen.getByRole("checkbox", { name }));
    }
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(consentCalls().map(([p, o]) => [p, o.body])).toEqual([
      ["/consents/terms_of_service", { granted: true }],
      ["/consents/privacy_policy", { granted: true }],
      ["/consents/health_data_processing", { granted: true }],
    ]);
    expect(prof.reload).toHaveBeenCalledTimes(1);
  });

  it("records the optional AI consent only when ticked", async () => {
    const user = userEvent.setup();
    renderPage();
    await toStep(user, 5);
    for (const name of [/terms of service/, /privacy policy/, /Store my health information/, /let the AI assistant/]) {
      await user.click(screen.getByRole("checkbox", { name }));
    }
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(consentCalls().map(([p]) => p)).toContain("/consents/ai_context");
  });

  it("shows the server error and stays on the step when a consent call fails", async () => {
    apiMock.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (opts?.method === "PUT") throw new ApiError(500, "HTTP_ERROR", "Could not record your consent.");
      return empty;
    });
    const user = userEvent.setup();
    renderPage();
    await toStep(user, 5);
    for (const name of [/terms of service/, /privacy policy/, /Store my health information/]) {
      await user.click(screen.getByRole("checkbox", { name }));
    }
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(await screen.findByText("Could not record your consent.")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Finish setup" })).toBeEnabled();
  });
});

describe("accessibility", () => {
  it("has no axe violations on the welcome, basics, access and privacy steps", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Get started" }));
    expect(await axe(container)).toHaveNoViolations();
    await user.type(screen.getByLabelText("Full name"), "Asha");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations while errors are showing", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole("button", { name: "Get started" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");
    expect(await axe(container)).toHaveNoViolations();
  });
});
