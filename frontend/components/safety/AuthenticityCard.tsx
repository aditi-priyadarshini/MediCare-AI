"use client";

import { useState } from "react";
import { Alert, Button, Card, TextField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { AUTH_TEXT } from "@/lib/safety";
import type { Authenticity } from "@/lib/types";

export function AuthenticityCard() {
  const [barcode, setBarcode] = useState("");
  const [lot, setLot] = useState("");
  const [result, setResult] = useState<Authenticity | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!barcode.trim() && !lot.trim()) return setFailure("Enter a barcode or a lot number.");
    setBusy(true);
    setFailure(null);
    try {
      setResult(
        await api<Authenticity>("/safety/authenticity/check", {
          method: "POST",
          body: { barcode: barcode.trim() || undefined, lot_number: lot.trim() || undefined },
        }),
      );
    } catch (err) {
      setResult(null);
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="auth-h" className="space-y-4">
      <div>
        <h2 id="auth-h" className="text-lg font-semibold text-ink">
          Is this pack genuine?
        </h2>
        <p className="mt-1 text-sm text-ink-soft">We can only confirm a pack when an authoritative source is connected.</p>
      </div>
      <form onSubmit={submit} noValidate className="space-y-3">
        <TextField label="Barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} maxLength={64} optional />
        <TextField label="Lot number" value={lot} onChange={(e) => setLot(e.target.value)} maxLength={64} optional />
        <Button type="submit" loading={busy}>
          Check
        </Button>
      </form>
      {failure && <Alert tone="danger" title="Could not check">{failure}</Alert>}
      {result && (
        <div aria-live="polite" className="space-y-2">
          <Alert tone={result.status === "verified" ? "success" : "info"} title={AUTH_TEXT[result.status]}>
            {result.detail}
            {result.source ? ` Source: ${result.source}.` : ""}
          </Alert>
          <p className="text-sm text-ink-soft">{result.note}</p>
        </div>
      )}
    </Card>
  );
}
