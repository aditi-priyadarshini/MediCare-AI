"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Alert,
  Button,
  EmptyState,
  SelectField,
  Skeleton,
  TextField,
  CheckboxField,
  VerificationBadge,
} from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import type { Allergy, Condition, EmergencyContact, Page } from "@/lib/types";
import { isE164, isEmail, toE164 } from "@/lib/validation";

function Loading() {
  return <Skeleton className="h-16 w-full" />;
}

function useSubmit() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run, setError };
}

/* -------------------------------------------------------------- Conditions */
export function ConditionsSection({ onChange }: { onChange?: () => void }) {
  const list = useAsync(() => api<Page<Condition>>("/conditions"), []);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const s = useSubmit();

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setNameError("Enter a condition name.");
    setNameError(undefined);
    void s.run(async () => {
      await api("/conditions", { method: "POST", body: { display_name: name.trim() } });
      setName("");
      await list.reload();
      onChange?.();
    });
  };

  const patch = (id: string, body: Record<string, unknown>) =>
    s.run(async () => {
      await api(`/conditions/${id}`, { method: "PATCH", body });
      await list.reload();
      onChange?.();
    });

  return (
    <div className="space-y-3">
      {s.error && <Alert tone="danger">{s.error}</Alert>}
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data && list.data.items.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.data.items.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <p className="font-medium text-ink">{c.display_name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  <span className="capitalize">{c.status}</span>
                  <VerificationBadge status={c.verification_status} />
                </div>
              </div>
              <div className="flex gap-1">
                {c.status === "active" && (
                  <Button variant="ghost" onClick={() => void patch(c.id, { status: "resolved" })}>
                    Mark resolved
                  </Button>
                )}
                <Button
                  variant="ghost"
                  aria-label={`Remove ${c.display_name} (entered in error)`}
                  onClick={() => void patch(c.id, { status: "entered_in_error" })}
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No conditions added">
          Add any you want on your record. You can skip this and come back later.
        </EmptyState>
      )}
      <form onSubmit={add} className="flex items-end gap-2" noValidate>
        <div className="flex-1">
          <TextField
            label="Add a condition"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={nameError}
            maxLength={200}
          />
        </div>
        <Button type="submit" variant="secondary" loading={s.busy}>
          <Plus className="h-4 w-4" aria-hidden /> Add
        </Button>
      </form>
      <p className="text-xs text-ink-soft">
        Entries are marked “Patient reported” until confirmed by a clinician. Removing an entry hides it
        but keeps your history.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- Allergies */
const SEVERITIES = [
  { value: "", label: "Not sure" },
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
];

export function AllergiesSection({ onChange }: { onChange?: () => void }) {
  const list = useAsync(() => api<Page<Allergy>>("/allergies"), []);
  const [substance, setSubstance] = useState("");
  const [reaction, setReaction] = useState("");
  const [severity, setSeverity] = useState("");
  const [subError, setSubError] = useState<string>();
  const s = useSubmit();

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!substance.trim()) return setSubError("Enter the substance.");
    setSubError(undefined);
    void s.run(async () => {
      await api("/allergies", {
        method: "POST",
        body: {
          substance: substance.trim(),
          reaction: reaction.trim() || null,
          severity: severity || null,
        },
      });
      setSubstance("");
      setReaction("");
      setSeverity("");
      await list.reload();
      onChange?.();
    });
  };

  const remove = (id: string) =>
    s.run(async () => {
      await api(`/allergies/${id}`, { method: "PATCH", body: { status: "entered_in_error" } });
      await list.reload();
      onChange?.();
    });

  return (
    <div className="space-y-3">
      {s.error && <Alert tone="danger">{s.error}</Alert>}
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data && list.data.items.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.data.items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <p className="font-medium text-ink">{a.substance}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  {a.reaction && <span>Reaction: {a.reaction}</span>}
                  {a.severity && <span className="capitalize">Severity: {a.severity}</span>}
                  <VerificationBadge status={a.verification_status} />
                </div>
              </div>
              <Button
                variant="ghost"
                aria-label={`Remove ${a.substance} allergy`}
                onClick={() => void remove(a.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No allergies recorded">
          Nothing is recorded yet. This does not mean you have no allergies.
        </EmptyState>
      )}
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-3" noValidate>
        <TextField label="Allergic to" value={substance} onChange={(e) => setSubstance(e.target.value)} error={subError} maxLength={200} />
        <TextField label="Reaction" optional value={reaction} onChange={(e) => setReaction(e.target.value)} maxLength={300} />
        <SelectField label="Severity" optional value={severity} onChange={(e) => setSeverity(e.target.value)} options={SEVERITIES} />
        <div className="sm:col-span-3">
          <Button type="submit" variant="secondary" loading={s.busy}>
            <Plus className="h-4 w-4" aria-hidden /> Add allergy
          </Button>
        </div>
      </form>
    </div>
  );
}

/* --------------------------------------------------------------- Contacts */
export function ContactsSection({ onChange }: { onChange?: () => void }) {
  const list = useAsync(() => api<Page<EmergencyContact>>("/emergency/contacts"), []);
  const [form, setForm] = useState({ name: "", relationship: "", phone: "", email: "", primary: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const s = useSubmit();

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const phone = toE164(form.phone);
    if (!form.name.trim()) next.name = "Enter a name.";
    if (!isE164(phone)) next.phone = "Enter a valid phone number (India numbers need no country code).";
    if (form.email && !isEmail(form.email)) next.email = "Enter a valid email address.";
    setErrors(next);
    if (Object.keys(next).length) return;
    void s.run(async () => {
      try {
        await api("/emergency/contacts", {
          method: "POST",
          body: {
            name: form.name.trim(),
            relationship: form.relationship.trim() || null,
            phone_e164: phone,
            email: form.email.trim() || null,
            is_primary: form.primary,
          },
        });
      } catch (err) {
        setErrors(fieldErrors(err));
        throw err;
      }
      setForm({ name: "", relationship: "", phone: "", email: "", primary: false });
      await list.reload();
      onChange?.();
    });
  };

  const remove = (id: string) =>
    s.run(async () => {
      await api(`/emergency/contacts/${id}`, { method: "DELETE" });
      await list.reload();
      onChange?.();
    });

  const makePrimary = (id: string) =>
    s.run(async () => {
      await api(`/emergency/contacts/${id}`, { method: "PATCH", body: { is_primary: true } });
      await list.reload();
    });

  return (
    <div className="space-y-3">
      {s.error && <Alert tone="danger">{s.error}</Alert>}
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data && list.data.items.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.data.items.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <p className="font-medium text-ink">
                  {c.name}
                  {c.is_primary && (
                    <span className="ml-2 rounded-full bg-mint-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                      Primary
                    </span>
                  )}
                </p>
                <p className="text-sm text-ink-soft">
                  {c.relationship ? `${c.relationship} · ` : ""}
                  {c.phone_e164}
                </p>
              </div>
              <div className="flex gap-1">
                {!c.is_primary && (
                  <Button variant="ghost" onClick={() => void makePrimary(c.id)}>
                    Make primary
                  </Button>
                )}
                <Button variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => void remove(c.id)}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No emergency contacts">Add someone we can show on your emergency summary.</EmptyState>
      )}
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-2" noValidate>
        <TextField label="Name" value={form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} maxLength={120} />
        <TextField label="Relationship" optional value={form.relationship} onChange={(e) => set("relationship", e.target.value)} maxLength={60} />
        <TextField label="Phone" type="tel" inputMode="tel" autoComplete="off" value={form.phone} onChange={(e) => set("phone", e.target.value)} error={errors.phone_e164 ?? errors.phone} />
        <TextField label="Email" optional type="email" value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />
        <div className="sm:col-span-2">
          <CheckboxField label="Primary contact" checked={form.primary} onChange={(e) => set("primary", e.target.checked)} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" loading={s.busy}>
            <Plus className="h-4 w-4" aria-hidden /> Add contact
          </Button>
        </div>
      </form>
    </div>
  );
}
