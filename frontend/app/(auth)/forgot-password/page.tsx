"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { Alert, Button, TextField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { isEmail } from "@/lib/validation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/password/forgot", { method: "POST", body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <AuthHeading title="Reset your password">We’ll email you a 6-digit code.</AuthHeading>
      {error && <Alert tone="danger" title="Couldn’t send code">{error}</Alert>}
      {sent ? (
        <>
          {/* Same message whether or not the account exists. */}
          <Alert tone="success" title="Check your email">
            If an account exists for that address, a reset code is on its way.
          </Alert>
          <Link
            href="/reset-password"
            className="flex min-h-control items-center justify-center rounded-lg bg-teal-700 text-sm font-semibold text-white transition-colors duration-fast hover:bg-brand-900"
          >
            I have a code
          </Link>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" fullWidth loading={busy}>
            Send reset code
          </Button>
        </form>
      )}
      <p className="text-center text-sm">
        <Link href="/login" className="inline-flex min-h-[44px] items-center font-semibold text-teal-700 underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
