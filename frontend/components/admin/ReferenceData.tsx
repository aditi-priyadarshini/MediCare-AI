"use client";

import { useState } from "react";
import { Alert, Button, Card, EmptyState, PageLoading, TextField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import type { AdminMedicine, AdminSource } from "@/lib/admin";
import { useAsync } from "@/lib/hooks";
import type { Page } from "@/lib/types";

function SourceForm({ onSaved }: { onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState({ name: "", publisher: "", url: "", licence: "", jurisdiction: "IN", version: "", reviewed_at: today });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    try {
      await api("/admin/sources", {
        method: "POST",
        body: { ...v, publisher: v.publisher || null, url: v.url || null, licence: v.licence || null },
      });
      onSaved();
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-lg border border-line p-4">
      <h3 className="text-base font-semibold text-ink">Add a source</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" value={v.name} onChange={set("name")} maxLength={200} required />
        <TextField label="Version" value={v.version} onChange={set("version")} maxLength={32} required />
        <TextField label="Publisher" value={v.publisher} onChange={set("publisher")} optional />
        <TextField label="Web address" type="url" value={v.url} onChange={set("url")} optional />
        <TextField label="Licence" value={v.licence} onChange={set("licence")} optional />
        <TextField label="Jurisdiction" value={v.jurisdiction} onChange={set("jurisdiction")} maxLength={16} required />
        <TextField label="Date reviewed" type="date" max={today} value={v.reviewed_at} onChange={set("reviewed_at")} required />
      </div>
      {failure && <Alert tone="danger" title="Not saved">{failure}</Alert>}
      <Button type="submit" loading={busy} disabled={!v.name.trim() || !v.version.trim()}>Add source</Button>
    </form>
  );
}

function CatalogueForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [form, setForm] = useState("");
  const [strength, setStrength] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    try {
      await api("/admin/medicines", {
        method: "POST",
        body: { name: name.trim(), form: form.trim() || null, strength_text: strength.trim() || null },
      });
      setName("");
      setForm("");
      setStrength("");
      onSaved();
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-lg border border-line p-4">
      <h3 className="text-base font-semibold text-ink">Add a medicine to the catalogue</h3>
      <p className="text-sm text-ink-soft">Names, forms and strengths only. No dosing or advice is stored here.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        <TextField label="Form" value={form} onChange={(e) => setForm(e.target.value)} maxLength={32} placeholder="tablet" optional />
        <TextField label="Strength" value={strength} onChange={(e) => setStrength(e.target.value)} maxLength={64} placeholder="500 mg" optional />
      </div>
      {failure && <Alert tone="danger" title="Not saved">{failure}</Alert>}
      <Button type="submit" loading={busy} disabled={name.trim().length < 2}>Add medicine</Button>
    </form>
  );
}

export function ReferenceData() {
  const sources = useAsync(() => api<Page<AdminSource>>("/admin/sources?limit=100"));
  const [q, setQ] = useState("");
  const meds = useAsync(() => api<Page<AdminMedicine>>(`/admin/medicines?limit=25&q=${encodeURIComponent(q)}`), [q]);

  return (
    <div className="space-y-6">
      <Card aria-labelledby="src-h" className="space-y-4">
        <div>
          <h2 id="src-h" className="text-lg font-semibold text-ink">Reference sources</h2>
          <p className="text-sm text-ink-soft">
            Every safety rule, ingredient and price must name where it came from. A source and version is added once
            and cannot be edited.
          </p>
        </div>
        <SourceForm onSaved={() => void sources.reload()} />
        {sources.loading && !sources.data ? (
          <PageLoading label="Loading sources" />
        ) : !sources.data ? (
          <Alert tone="danger" title="Could not load sources">{errorMessage(sources.error)}</Alert>
        ) : sources.data.items.length === 0 ? (
          <EmptyState title="No sources yet" />
        ) : (
          <ul className="space-y-2 text-sm">
            {sources.data.items.map((s) => (
              <li key={s.id} className="rounded-lg border border-line p-3">
                <span className="font-medium text-ink">{s.name}</span> version {s.version}, {s.jurisdiction}, reviewed {s.reviewed_at}
                {s.publisher ? `. ${s.publisher}` : ""}
                {s.licence ? `. Licence: ${s.licence}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card aria-labelledby="cat-h" className="space-y-4">
        <h2 id="cat-h" className="text-lg font-semibold text-ink">Medicine catalogue</h2>
        <CatalogueForm onSaved={() => void meds.reload()} />
        <TextField label="Search the catalogue" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        {meds.loading && !meds.data ? (
          <PageLoading label="Loading catalogue" />
        ) : !meds.data ? (
          <Alert tone="danger" title="Could not load the catalogue">{errorMessage(meds.error)}</Alert>
        ) : meds.data.items.length === 0 ? (
          <EmptyState title="No medicines match" />
        ) : (
          <>
            <ul className="divide-y divide-line text-sm">
              {meds.data.items.map((m) => (
                <li key={m.id} className="py-2">
                  <span className="font-medium text-ink">{m.name}</span>
                  {[m.form, m.strength_text].filter(Boolean).length ? `, ${[m.form, m.strength_text].filter(Boolean).join(", ")}` : ""}
                  <span className="ml-2 text-ink-soft">({m.source === "seed" ? "bundled" : "added by an administrator"})</span>
                </li>
              ))}
            </ul>
            <p role="status" aria-live="polite" className="text-sm text-ink-soft">
              Showing {meds.data.items.length} of {meds.data.total}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
