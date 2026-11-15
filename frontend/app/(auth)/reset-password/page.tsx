"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, PasswordField, TextField } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { isEmail, isSixDigitCode, passwordProblem, PASSWORD_MIN } from "@/lib/validation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!isEmail(email)) next.email = "Enter a valid email address.";
    if (!isSixDigitCode(code)) next.code = "Enter the 6-digit code.";
    const pw = passwordProblem(password, email);
    if (pw) next.new_password = pw;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await api("/auth/password/reset", {
        method: "POST",
        body: { email: email.trim(), code: code.trim(), new_password: password },
      });
      router.replace("/login?reset=1");
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Choose a new password</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Resetting signs you out everywhere. Codes are single-use and expire after 10 minutes.
        </p>
      </div>
      {formError && <Alert tone="danger" title="Couldn’t reset password">{formError}</Alert>}
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
        <TextField
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          error={errors.code}
        />
        <PasswordField
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.new_password}
          hint={`At least ${PASSWORD_MIN} characters.`}
        />
        <Button type="submit" fullWidth loading={busy}>
          Update password
        </Button>
      </form>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="font-semibold text-teal-700 underline">
          Request a new code
        </Link>
      </p>
    </div>
  );
}
