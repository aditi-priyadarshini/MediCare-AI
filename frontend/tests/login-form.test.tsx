import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/LoginForm";
import { ApiError } from "@/lib/api-client";

const replace = vi.fn();
const login = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ login }) }));
vi.mock("@/components/auth/GoogleButton", () => ({ GoogleButton: () => null }));

beforeEach(() => {
  replace.mockReset();
  login.mockReset();
  search = "";
});

describe("LoginForm", () => {
  it("validates before calling the API and labels fields", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInvalid();
    expect(login).not.toHaveBeenCalled();
  });

  it("routes verified users to the dashboard", async () => {
    login.mockResolvedValue({ email_verified: true });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(login).toHaveBeenCalledWith("a@example.com", "correct-horse-battery");
  });

  it("routes unverified users to email verification", async () => {
    login.mockResolvedValue({ email_verified: false });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/verify-email"));
  });

  it("shows the server error as an alert and re-enables the form", async () => {
    login.mockRejectedValue(new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password."));
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("toggles password visibility with an accessible control", async () => {
    render(<LoginForm />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses autofill-friendly attributes", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });

  it("confirms a finished password reset with a status message", () => {
    search = "reset=1";
    render(<LoginForm />);
    expect(screen.getByRole("status")).toHaveTextContent(/Password updated/);
  });

  it("explains OAuth failures from the redirect", () => {
    search = "error=oauth_state";
    render(<LoginForm />);
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn’t be verified/);
  });
});
