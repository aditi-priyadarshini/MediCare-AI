"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { SharedSummaryView } from "@/components/sharing/SharedSummaryView";
import { LinkButton } from "@/components/ui/LinkButton";
import { Alert, Button, CheckboxField, SelectField, TextField } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import {
  CATEGORIES,
  EXPIRY_OPTIONS,
  scopeKey,
  type ShareCategory,
  type ShareCreated,
  type SharedSummary,
} from "@/lib/sharing";

function Step({ n, id, title, children }: { n: number; id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-card border border-line p-5">
      <h3 id={id} className="flex items-center gap-3 font-semibold text-navy-900">
        <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-sm text-white">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Create a share in three numbered sections: who, what, then preview exactly what the recipient
 * will see and confirm. The preview is only valid for the exact selection it was made for.
 * It lives on its own page (/share/new); the Sharing page just lists shares.
 */
export function CreateShareCard({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cats, setCats] = useState<ShareCategory[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hours, setHours] = useState("72");
  const [preview, setPreview] = useState<{ key: string; data: SharedSummary } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "create" | null>(null);
  const [created, setCreated] = useState<ShareCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const key = scopeKey(cats, from, to);
  const previewValid = preview?.key === key;
  const body = { categories: cats, date_from: from || null, date_to: to || null };

  const toggle = (id: ShareCategory, on: boolean) => {
    setCats((cur) => (on ? [...new Set([...cur, id])] : cur.filter((c) => c !== id)));
    setConfirmed(false);
  };

  async function runPreview() {
    setErrors({});
    setFailure(null);
    if (cats.length === 0) return setErrors({ categories: "Choose at least one thing to share." });
    if (from && to && from > to) return setErrors({ date_from: "The start date cannot be after the end date." });
    setBusy("preview");
    try {
      setPreview({ key, data: await api<SharedSummary>("/shares/preview", { method: "POST", body }) });
      setConfirmed(false);
    } catch (e) {
      setErrors(fieldErrors(e));
      setFailure(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!previewValid || !confirmed) return;
    setBusy("create");
    setErrors({});
    setFailure(null);
    try {
      const result = await api<ShareCreated>("/shares", {
        method: "POST",
        body: { ...body, recipient_name: name, recipient_email: email, expires_in_hours: Number(hours), confirm: true },
      });
      setCreated(result);
      setPreview(null);
      setConfirmed(false);
      setName("");
      setEmail("");
      setCats([]);
      setFrom("");
      setTo("");
      onCreated();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFailure(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title={`Shared with ${created.share.recipient_name}`}>
          <p>
            {created.notification_sent
              ? "We emailed them the link. They will need a one-time code, sent to that address, to open it."
              : "We could not email the link, so please pass it on yourself. They will still need a one-time code, sent to their address."}
          </p>
          <p className="mt-2 font-medium">This link is shown only once.</p>
          <p className="mt-1 break-all rounded bg-surface p-2 font-mono text-xs">{created.link}</p>
          <Button variant="secondary" className="mt-2" onClick={() => void copy(created.link)}>
            <Copy className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy link"}
          </Button>
        </Alert>
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/share">Back to sharing</LinkButton>
          <Button variant="secondary" onClick={() => setCreated(null)}>
            Share with someone else
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={create} className="space-y-5" noValidate>
      <p className="text-sm text-ink-soft">
        Choose who, choose what, check the preview, then confirm. You can withdraw access at any time.
      </p>

      <Step n={1} id="share-who" title="Who is it for?">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Recipient's name" value={name} onChange={(e) => setName(e.target.value)} error={errors.recipient_name} maxLength={120} autoComplete="off" />
          <TextField
            label="Recipient's email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.recipient_email}
            hint="A one-time code is sent here when they open the link. Check the address carefully."
            autoComplete="off"
          />
        </div>
      </Step>

      <Step n={2} id="share-what" title="What do you want to share?">
        <fieldset className="space-y-3">
          <legend className="sr-only">What to share</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {CATEGORIES.map((c) => (
              <CheckboxField
                key={c.id}
                label={c.label}
                description={c.description}
                checked={cats.includes(c.id)}
                onChange={(e) => toggle(c.id, e.target.checked)}
                className="rounded-lg border border-line p-3"
              />
            ))}
          </div>
          {errors.categories && <p className="text-xs font-medium text-danger-700">{errors.categories}</p>}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Lab results and records from" type="date" optional value={from} onChange={(e) => { setFrom(e.target.value); setConfirmed(false); }} error={errors.date_from} />
          <TextField label="Up to" type="date" optional value={to} onChange={(e) => { setTo(e.target.value); setConfirmed(false); }} error={errors.date_to} />
        </div>
      </Step>

      <Step n={3} id="share-check" title="Check and confirm">
        <div className="max-w-xs">
          <SelectField label="Link works for" value={hours} onChange={(e) => setHours(e.target.value)} options={EXPIRY_OPTIONS.map((o) => ({ value: String(o.hours), label: o.label }))} />
        </div>

        <Button variant="secondary" onClick={() => void runPreview()} loading={busy === "preview"}>
          Preview what they will see
        </Button>

        {preview && (
          <div className="space-y-3 rounded-lg border border-line p-4" aria-live="polite">
            <h4 className="font-semibold text-ink">Preview</h4>
            {!previewValid && (
              <Alert tone="warning" title="Your choices changed">
                Preview again before you share.
              </Alert>
            )}
            <div className={previewValid ? "" : "opacity-50"}>
              <SharedSummaryView summary={preview.data} />
            </div>
          </div>
        )}

        <CheckboxField
          checked={confirmed}
          disabled={!previewValid}
          onChange={(e) => setConfirmed(e.target.checked)}
          label={`I have checked the preview and want to share this with ${name.trim() || "this person"}.`}
          description="Anyone who has the link and can read that inbox could open it until it ends or you withdraw it."
        />

        {failure && (
          <Alert tone="danger" title="Not shared">
            {failure}
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={busy === "create"} disabled={!previewValid || !confirmed || !name.trim() || !email.trim()}>
            Share now
          </Button>
          <LinkButton href="/share" variant="ghost">
            Cancel
          </LinkButton>
        </div>
      </Step>
    </form>
  );
}
