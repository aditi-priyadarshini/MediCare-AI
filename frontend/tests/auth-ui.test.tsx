import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/LoginForm";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import AuthLayout from "@/app/(auth)/layout";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import RegisterPage from "@/app/(auth)/register/page";
import ResetPasswordPage from "@/app/(auth)/reset-password/page";
import VerifyEmailPage from "@/app/(auth)/verify-email/page";
import NotFound from "@/app/not-found";
import { ApiError } from "@/lib/api-client";

expect.extend(axeMatchers);
// Pages render inside a layout that supplies the <main> landmark, so the page-level region rule is off.
const axe = configureAxe({ rules: { region: { enabled: false } } });
declare module "vitest" {
  interface Assertion {
    toHaveNoViolations(): void;
  }
}

const replace = vi.fn();
const api = vi.fn();
const register = vi.fn();
const verifyEmail = vi.fn();
const logout = vi.fn();
let pathname = "/login";
let auth: { status: string; user: unknown } = { status: "anonymous", user: null };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  api: (...args: unknown[]) => api(...args),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ ...auth, register, verifyEmail, logout, login: vi.fn() }),
}));
vi.mock("@/components/auth/GoogleButton", () => ({ GoogleButton: () => null }));

beforeEach(() => {
  for (const m of [replace, api, register, verifyEmail, logout]) m.mockReset();
  pathname = "/login";
  auth = { status: "anonymous", user: null };
});
afterEach(() => vi.useRealTimers());

const unverified = { email: "me@example.com", email_verified: false };

describe("AuthLayout redirects (unchanged behaviour)", () => {
  it("shows the form, brand panel and trust copy to anonymous visitors", () => {
    render(<AuthLayout><p>child</p></AuthLayout>);
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(screen.getByText("Private by default")).toBeInTheDocument();
    expect(screen.getByText("Not a medical device")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
  it("does not claim certifications or approvals", () => {
    const { container } = render(<AuthLayout><p>child</p></AuthLayout>);
    expect(container.textContent).not.toMatch(/\bHIPAA\b|\bISO\b|certified|approved|\bFDA\b/);
  });
  it("sends verified users to the dashboard", () => {
    auth = { status: "authenticated", user: { email_verified: true } };
    render(<AuthLayout><p>child</p></AuthLayout>);
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });
  it("sends unverified users to verify-email, but leaves them there", () => {
    auth = { status: "authenticated", user: unverified };
    render(<AuthLayout><p>child</p></AuthLayout>);
    expect(replace).toHaveBeenCalledWith("/verify-email");
    replace.mockReset();
    pathname = "/verify-email";
    render(<AuthLayout><p>child on verify</p></AuthLayout>);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("child on verify")).toBeInTheDocument();
  });
});

describe("Register", () => {
  it("ticks password requirements as you type, in text as well as icon", async () => {
    render(<RegisterPage />);
    const list = () => screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(list().join("|")).toContain("not yet");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse-battery");
    expect(list().every((t) => t?.includes("done"))).toBe(true);
  });
  it("keeps the server's existing-account (409) message visible and the form usable", async () => {
    register.mockRejectedValue(new ApiError(409, "EMAIL_EXISTS", "An account with this email already exists."));
    render(<RegisterPage />);
    await userEvent.type(screen.getByLabelText("Full name"), "Asha");
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });
  it("sends new accounts to verify-email", async () => {
    register.mockResolvedValue(undefined);
    render(<RegisterPage />);
    await userEvent.type(screen.getByLabelText("Full name"), "Asha");
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/verify-email"));
    expect(register).toHaveBeenCalledWith("a@example.com", "correct-horse-battery", "Asha");
  });
  it("uses new-password autofill", () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  });
});

describe("Verify email", () => {
  beforeEach(() => {
    auth = { status: "authenticated", user: unverified };
  });
  it("explains expiry and shows a visible resend cooldown that counts down", async () => {
    vi.useFakeTimers();
    render(<VerifyEmailPage />);
    expect(screen.getByText(/expires in 10 minutes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend code in 60s" })).toBeDisabled();
    for (let i = 0; i < 3; i++) await act(async () => void vi.advanceTimersByTime(1000));
    expect(screen.getByRole("button", { name: "Resend code in 57s" })).toBeDisabled();
    expect(screen.getByText(/new code in 57 seconds/)).toBeInTheDocument();
  });
  it("enables resend after the cooldown and restarts it after sending", async () => {
    vi.useFakeTimers();
    api.mockResolvedValue({});
    render(<VerifyEmailPage />);
    for (let i = 0; i < 60; i++) await act(async () => void vi.advanceTimersByTime(1000));
    const resend = screen.getByRole("button", { name: "Resend code" });
    expect(resend).toBeEnabled();
    await act(async () => resend.click());
    expect(api).toHaveBeenCalledWith("/auth/email/resend", { method: "POST" });
    expect(screen.getByRole("button", { name: "Resend code in 60s" })).toBeDisabled();
    expect(screen.getByText(/Earlier codes no longer work/)).toBeInTheDocument();
  });
  it("rejects a short code before calling the API and has one-time-code autofill", async () => {
    render(<VerifyEmailPage />);
    const input = screen.getByLabelText("Verification code");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    await userEvent.type(input, "12");
    await userEvent.click(screen.getByRole("button", { name: "Verify email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("6-digit code");
    expect(verifyEmail).not.toHaveBeenCalled();
  });
  it("verifies and goes to the dashboard", async () => {
    verifyEmail.mockResolvedValue(undefined);
    render(<VerifyEmailPage />);
    await userEvent.type(screen.getByLabelText("Verification code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify email" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });
});

describe("Forgot and reset password", () => {
  it("uses the same neutral wording, never saying whether the account exists", async () => {
    api.mockResolvedValue({});
    render(<ForgotPasswordPage />);
    await userEvent.type(screen.getByLabelText("Email"), "nobody@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset code" }));
    const msg = await screen.findByRole("status");
    expect(msg).toHaveTextContent("If an account exists for that address, a reset code is on its way.");
    expect(msg.textContent).not.toMatch(/no account|not found|doesn.t exist/i);
    expect(screen.getByRole("link", { name: "I have a code" })).toHaveAttribute("href", "/reset-password");
  });
  it("reset shows live password requirements and returns to login on success", async () => {
    api.mockResolvedValue({});
    render(<ResetPasswordPage />);
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("6-digit code"), "123456");
    await userEvent.type(screen.getByLabelText("New password"), "correct-horse-battery");
    expect(screen.getAllByRole("listitem").every((li) => li.textContent?.includes("done"))).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?reset=1"));
  });
});

describe("Not found", () => {
  it("offers a way home and emergency help", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/can’t find that page/);
    expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Emergency help" })).toHaveAttribute("href", "/emergency");
  });
});

describe("axe", () => {
  it("login, register, forgot, reset, requirements and 404 have no violations", async () => {
    for (const ui of [
      <LoginForm key="l" />,
      <RegisterPage key="r" />,
      <ForgotPasswordPage key="f" />,
      <ResetPasswordPage key="p" />,
      <PasswordRequirements key="q" password="abc" email="a@b.co" />,
      <NotFound key="n" />,
    ]) {
      const { container, unmount } = render(ui);
      expect(await axe(container)).toHaveNoViolations();
      unmount();
    }
  });
  it("verify-email and the split-screen layout have no violations", async () => {
    auth = { status: "authenticated", user: unverified };
    pathname = "/verify-email";
    const v = render(<VerifyEmailPage />);
    expect(await axe(v.container)).toHaveNoViolations();
    v.unmount();
    auth = { status: "anonymous", user: null };
    const l = render(<AuthLayout><h1>Page</h1></AuthLayout>);
    expect(await axe(l.container)).toHaveNoViolations();
  });
});
