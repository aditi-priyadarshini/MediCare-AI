"use client";

import { MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { Alert, Button, PageLoading, TextField } from "@/components/ui/primitives";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useCountdown } from "@/lib/hooks";
import { isSixDigitCode } from "@/lib/validation";

const RESEND_SECONDS = 60;

export default function VerifyEmailPage() {
  const { status, user, verifyEmail, logout } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cooldown = useCountdown(RESEND_SECONDS); // a code was just sent at registration

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated" || !user) return <PageLoading />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!isSixDigitCode(code)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      await verifyEmail(code.trim());
      router.replace("/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    try {
      await api("/auth/email/resend", { method: "POST" });
      setNotice("We’ve sent a new code. Earlier codes no longer work.");
      cooldown.restart(RESEND_SECONDS);
    } catch (err) {
      if (err instanceof ApiError && err.code === "RESEND_COOLDOWN") cooldown.restart(RESEND_SECONDS);
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-mint-100 text-teal-700" aria-hidden>
        <MailCheck className="h-6 w-6" />
      </div>
      <AuthHeading title="Check your email">
        We sent a 6-digit code to <strong className="break-all text-ink">{user.email}</strong>. The code expires in 10
        minutes, and only the newest code works.
      </AuthHeading>
      {error && <Alert tone="danger" title="Couldn’t verify">{error}</Alert>}
      {notice && <Alert tone="success" title="Code sent">{notice}</Alert>}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]*"
          hint="Enter the 6 digits. Not there? Check your spam folder."
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="tnum text-center text-2xl tracking-[0.4em]"
        />
        <Button type="submit" fullWidth loading={busy}>
          Verify email
        </Button>
      </form>
      <div className="border-t border-line pt-4">
        <p className="text-sm text-ink-soft">
          {cooldown.left > 0
            ? `You can ask for a new code in ${cooldown.left} seconds.`
            : "Didn’t get a code? You can ask for a new one now."}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" onClick={resend} disabled={cooldown.left > 0}>
            {cooldown.left > 0 ? `Resend code in ${cooldown.left}s` : "Resend code"}
          </Button>
          <Button variant="ghost" onClick={() => void logout().then(() => router.replace("/login"))}>
            Use a different account
          </Button>
        </div>
      </div>
    </div>
  );
}
