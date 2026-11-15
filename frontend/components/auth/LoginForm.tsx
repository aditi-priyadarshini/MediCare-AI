"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { Alert, Button, PasswordField, TextField } from "@/components/ui/primitives";
import { errorMessage, fieldErrors } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { isEmail } from "@/lib/validation";

const OAUTH_ERRORS: Record<string, string> = {
  oauth_state: "Google sign-in couldn’t be verified. Please try again.",
  oauth_failed: "Google sign-in didn’t complete. Please try again.",
  oauth_unverified: "Your Google email address isn’t verified, so we can’t use it to sign in.",
};

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const oauthError = OAUTH_ERRORS[params.get("error") ?? ""];
  const justReset = params.get("reset") === "1";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!isEmail(email)) next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const user = await login(email.trim(), password);
      router.replace(user.email_verified ? "/dashboard" : "/verify-email");
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-soft">Sign in to your health record.</p>
      </div>

      {justReset && <Alert tone="success" title="Password updated">Sign in with your new password.</Alert>}
      {oauthError && <Alert tone="danger" title="Couldn’t sign in with Google">{oauthError}</Alert>}
      {formError && <Alert tone="danger" title="Couldn’t sign in">{formError}</Alert>}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <div className="text-right text-sm">
          <Link href="/forgot-password" className="font-medium text-teal-700 underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" fullWidth loading={busy}>
          Sign in
        </Button>
      </form>

      <GoogleButton />

      <p className="text-center text-sm text-ink-soft">
        New here?{" "}
        <Link href="/register" className="font-semibold text-teal-700 underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
