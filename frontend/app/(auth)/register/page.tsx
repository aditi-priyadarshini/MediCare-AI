"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { Alert, Button, PasswordField, TextField } from "@/components/ui/primitives";
import { errorMessage, fieldErrors } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { isEmail, passwordProblem, PASSWORD_MIN } from "@/lib/validation";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.display_name = "Enter your name.";
    if (!isEmail(email)) next.email = "Enter a valid email address.";
    const pw = passwordProblem(password, email);
    if (pw) next.password = pw;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await register(email.trim(), password, name.trim());
      router.replace("/verify-email");
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Create your account</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Your records are private by default. Only you can see them.
        </p>
      </div>
      {formError && <Alert tone="danger" title="Couldn’t create your account">{formError}</Alert>}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField
          label="Full name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.display_name}
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={`At least ${PASSWORD_MIN} characters. A passphrase of a few words works well.`}
        />
        <Button type="submit" fullWidth loading={busy}>
          Create account
        </Button>
      </form>
      <GoogleButton />
      <p className="text-center text-sm text-ink-soft">
        Already registered?{" "}
        <Link href="/login" className="font-semibold text-teal-700 underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
