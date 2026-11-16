"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand";
import { SharedSummaryView } from "@/components/sharing/SharedSummaryView";
import { Alert, Button, Card, PageLoading, TextField } from "@/components/ui/primitives";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { isSixDigits, tokenFromHash, type SharedView } from "@/lib/sharing";

type Step = "reading" | "no-link" | "start" | "code" | "view";

/**
 * Recipient side. The link's secret lives in the URL fragment, which browsers never send to a
 * server, and is held only in this component's memory. Access needs the emailed one-time code.
 */
export function SharedClient() {
  const [step, setStep] = useState<Step>("reading");
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const [session, setSession] = useState("");
  const [view, setView] = useState<SharedView | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = tokenFromHash(window.location.hash);
    if (t) {
      setToken(t);
      setStep("start");
    } else setStep("no-link");
  }, []);

  async function start() {
    setBusy(true);
    setProblem(null);
    try {
      const r = await api<{ message: string }>("/share-access/start", { method: "POST", body: { token } });
      setNotice(r.message);
      setStep("code");
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function load(sessionToken: string) {
    const res = await fetch("/api/v1/share-access/summary", {
      headers: { "X-Share-Session": sessionToken },
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new ApiError(res.status, "SHARE", body.error?.message ?? "Could not open this summary.");
    }
    setView((await res.json()) as SharedView);
    setStep("view");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!isSixDigits(code)) return setProblem("Enter the 6-digit code from the email.");
    setBusy(true);
    setProblem(null);
    try {
      const r = await api<{ session_token: string }>("/share-access/verify", {
        method: "POST",
        body: { token, code: code.trim() },
      });
      setSession(r.session_token);
      await load(r.session_token);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setProblem(null);
    try {
      await load(session);
    } catch (err) {
      setView(null);
      setSession("");
      setCode("");
      setStep("start");
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-6 p-4 sm:p-8">
      <header className="flex items-center justify-between">
        <Logo />
        <span className="flex items-center gap-1.5 text-xs text-ink-soft">
          <ShieldCheck className="h-4 w-4" aria-hidden /> Shared privately
        </span>
      </header>

      {step === "reading" && <PageLoading label="Opening link" />}

      {step === "no-link" && (
        <Alert tone="warning" title="This link is incomplete">
          Open the full link from the email you were sent. If it still does not work, ask the person who shared it to send a
          new one.
        </Alert>
      )}

      {step === "start" && (
        <Card className="space-y-4">
          <h1 className="text-xl font-semibold text-ink">Health information shared with you</h1>
          <p className="text-sm text-ink-soft">
            To keep this private, we will email a one-time code to the address this was shared with. Enter it on the next screen.
          </p>
          {problem && (
            <Alert tone="danger" title="Could not continue">
              {problem}
            </Alert>
          )}
          <Button onClick={() => void start()} loading={busy}>
            Email me a code
          </Button>
        </Card>
      )}

      {step === "code" && (
        <Card className="space-y-4">
          <h1 className="text-xl font-semibold text-ink">Enter your code</h1>
          {notice && <p className="text-sm text-ink-soft">{notice}</p>}
          <form onSubmit={verify} className="space-y-4" noValidate>
            <TextField
              label="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            {problem && (
              <Alert tone="danger" title="That did not work">
                {problem}
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy}>
                Open
              </Button>
              <Button variant="secondary" onClick={() => void start()} disabled={busy}>
                Send a new code
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === "view" && view && (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">Shared by {view.shared_by}</h1>
            <p className="text-sm text-ink-soft">
              For {view.recipient_name}. Access ends {new Date(view.expires_at).toLocaleString()} or sooner if withdrawn.
            </p>
          </div>
          {problem && (
            <Alert tone="danger" title="Not updated">
              {problem}
            </Alert>
          )}
          <Card>
            <SharedSummaryView summary={view.summary} />
          </Card>
          <Button variant="secondary" onClick={() => void refresh()} loading={busy}>
            Refresh
          </Button>
        </div>
      )}
    </div>
  );
}
