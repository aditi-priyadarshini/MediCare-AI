"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { ConfirmationDialog } from "@/components/ui/Dialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Alert, Button, EmptyState, Skeleton, TextField } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { formatDate, parseNumber } from "@/lib/records";
import type { Medication, Supply } from "@/lib/types";

function SupplyForm({ med, onDone }: { med: Medication; onDone: () => void }) {
  const [form, setForm] = useState({ lot: "", maker: "", expiry: "", qty: "", unit: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseNumber(form.qty);
    const next: Record<string, string> = {};
    if (qty === null || Number.isNaN(qty) || qty <= 0) next.quantity_initial = "Enter how many you have, such as 30.";
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api<Supply>(`/medications/${med.id}/supplies`, {
        method: "POST",
        body: {
          lot_number: form.lot.trim() || null,
          manufacturer: form.maker.trim() || null,
          expiry_date: form.expiry || null,
          quantity_initial: qty,
          unit: form.unit.trim() || null,
        },
      });
      onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4 rounded-lg border border-line p-3 sm:grid-cols-2">
      <TextField label="How many" inputMode="decimal" value={form.qty} onChange={(e) => set("qty", e.target.value)} error={errors.quantity_initial} hint="Tablets, ml or doses in this pack" />
      <TextField label="Unit" optional value={form.unit} onChange={(e) => set("unit", e.target.value)} maxLength={16} hint="For example: tablets" />
      <TextField label="Expiry date" optional type="date" value={form.expiry} onChange={(e) => set("expiry", e.target.value)} error={errors.expiry_date} />
      <TextField label="Batch or lot number" optional value={form.lot} onChange={(e) => set("lot", e.target.value)} maxLength={64} hint="Printed on the pack" />
      <div className="sm:col-span-2">
        <TextField label="Maker" optional value={form.maker} onChange={(e) => set("maker", e.target.value)} maxLength={200} />
      </div>
      {failure && (
        <div className="sm:col-span-2">
          <Alert tone="danger">{failure}</Alert>
        </div>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy}>
          Save supply
        </Button>
      </div>
    </form>
  );
}

function SupplyRow({ s, onChange }: { s: Supply; onChange: () => void }) {
  const [count, setCount] = useState(String(s.quantity_remaining));
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function patch(body: unknown) {
    setError(null);
    try {
      await api<Supply>(`/supplies/${s.id}`, { method: "PATCH", body });
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  const n = parseNumber(count);
  return (
    <li className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink">
          {s.lot_number ? `Lot ${s.lot_number}` : "Supply"}
          {s.manufacturer ? ` · ${s.manufacturer}` : ""}
          <span className="ml-2 text-ink-soft">{s.expiry_date ? `Expires ${formatDate(s.expiry_date)}` : "No expiry date"}</span>
        </p>
        <Button variant="ghost" aria-label={`Remove ${s.lot_number ? `lot ${s.lot_number}` : "this pack"}`} onClick={() => setConfirm(true)}>
          Remove
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32">
          <TextField label={`Left${s.unit ? ` (${s.unit})` : ""}`} inputMode="decimal" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <Button
          variant="secondary"
          disabled={n === null || Number.isNaN(n) || n < 0 || n === s.quantity_remaining}
          onClick={() => void patch({ quantity_remaining: n })}
        >
          Update count
        </Button>
        <span className="pb-3 text-xs text-ink-soft">of {s.quantity_initial} to start</span>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <ConfirmationDialog
        open={confirm}
        destructive
        title="Remove this pack?"
        confirmLabel="Remove pack"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void patch({ status: "discarded" });
        }}
      >
        It will no longer count towards your supply or refill and expiry alerts.
      </ConfirmationDialog>
    </li>
  );
}

export function Supplies({ med, onChange }: { med: Medication; onChange: () => void }) {
  const list = useAsync(() => api<Supply[]>(`/medications/${med.id}/supplies`), []);
  const [adding, setAdding] = useState(false);
  const refresh = () => {
    void list.reload();
    onChange();
  };
  return (
    <section aria-label="Supplies" className="space-y-3">
      <h4 className="text-sm font-semibold text-navy-900">Supply on hand</h4>
      {list.error && !list.data ? (
        <ErrorState title="Couldn’t load supplies" onRetry={() => void list.reload()}>{errorMessage(list.error)}</ErrorState>
      ) : list.loading && !list.data ? (
        <Skeleton className="h-10 w-full" />
      ) : list.data && list.data.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.data.map((s) => (
            <SupplyRow key={`${s.id}-${s.quantity_remaining}`} s={s} onChange={refresh} />
          ))}
        </ul>
      ) : (
        <EmptyState title="No supply recorded">Add a pack to get refill and expiry alerts.</EmptyState>
      )}
      {adding ? (
        <SupplyForm
          med={med}
          onDone={() => {
            setAdding(false);
            refresh();
          }}
        />
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add a pack
        </Button>
      )}
      <p className="text-xs text-ink-soft">Taking a dose uses up stock from the pack that expires first. Undoing a dose puts it back.</p>
    </section>
  );
}

