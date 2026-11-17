"use client";

import { Download, Paperclip, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { ConfirmationDialog } from "@/components/ui/Dialog";
import { Alert, Button, SelectField, TextField, VerificationBadge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { checkUpload, EDIT_RESETS_NOTICE, formatBytes, formatDate, RECORD_TYPES, recordTypeLabel, REPLACE_RESETS_NOTICE, todayISO } from "@/lib/records";
import type { HealthRecord, RecordType } from "@/lib/types";
import { uploadRecordFile } from "./AddRecordForm";

type Confirm = null | "remove" | "removeFile";

/**
 * Everything about one record: details and verification, download (the API writes the audit entry),
 * edit, replace or remove the file, and remove-as-entered-in-error. Nothing is ever hard-deleted.
 */
export function RecordDrawer({ record, onClose, onChanged }: { record: HealthRecord | null; onClose: () => void; onChanged: () => Promise<void> }) {
  return (
    <Drawer open={record !== null} onClose={onClose} title={record?.title ?? "Record"} closeLabel="Close record details" className="sm:w-[28rem]">
      {record && <Body key={record.id} record={record} onClose={onClose} onChanged={onChanged} />}
    </Drawer>
  );
}

function Body({ record, onClose, onChanged }: { record: HealthRecord; onClose: () => void; onChanged: () => Promise<void> }) {
  const { show } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    record_type: record.record_type,
    title: record.title,
    record_date: record.record_date ?? "",
    provider_name: record.provider_name ?? "",
    notes: record.notes ?? "",
  });
  const pick = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function run(fn: () => Promise<void>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
      show(done, "success");
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setErrors({ title: "Give this record a title." });
    setErrors({});
    const ok = await run(async () => {
      try {
        await api(`/records/${record.id}`, {
          method: "PATCH",
          body: {
            record_type: form.record_type,
            title: form.title.trim(),
            record_date: form.record_date || null,
            provider_name: form.provider_name.trim() || null,
            notes: form.notes.trim() || null,
          },
        });
      } catch (err) {
        setErrors(fieldErrors(err));
        throw err;
      }
    }, "Record updated.");
    if (ok) setEditing(false);
  }

  function onReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const problem = checkUpload(f);
    if (problem) return setError(problem);
    void run(() => uploadRecordFile(record.id, f), "File attached.");
  }

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      {!editing ? (
        <section aria-label="Details" className="space-y-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-soft">Type</dt>
            <dd className="text-ink">{recordTypeLabel(record.record_type)}</dd>
            <dt className="text-ink-soft">Date</dt>
            <dd className="text-ink tnum">{formatDate(record.record_date)}</dd>
            <dt className="text-ink-soft">Doctor or lab</dt>
            <dd className="break-words text-ink">{record.provider_name ?? "Not set"}</dd>
            <dt className="text-ink-soft">Status</dt>
            <dd><VerificationBadge status={record.verification_status} /></dd>
            <dt className="text-ink-soft">Notes</dt>
            <dd className="whitespace-pre-wrap break-words text-ink">{record.notes ?? "None"}</dd>
          </dl>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" aria-hidden /> Edit details
          </Button>
        </section>
      ) : (
        <form onSubmit={(e) => void save(e)} noValidate className="space-y-4" aria-label="Edit record">
          <Alert tone="warning" title="Editing changes the status">{EDIT_RESETS_NOTICE}</Alert>
          <SelectField label="Type" value={form.record_type} onChange={(e) => set("record_type", e.target.value as RecordType)} options={RECORD_TYPES} />
          <TextField label="Title" value={form.title} onChange={(e) => set("title", e.target.value)} error={errors.title} maxLength={200} />
          <TextField label="Date" optional type="date" max={todayISO()} value={form.record_date} onChange={(e) => set("record_date", e.target.value)} error={errors.record_date} />
          <TextField label="Doctor or lab" optional value={form.provider_name} onChange={(e) => set("provider_name", e.target.value)} maxLength={200} />
          <TextField label="Notes" optional value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy}>Save changes</Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      )}

      <section aria-label="File" className="space-y-3 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-navy-900">File</h3>
        <input ref={pick} type="file" hidden accept="application/pdf,image/png,image/jpeg" onChange={onReplace} aria-label="Choose a file to attach" />
        {record.has_file ? (
          <>
            <p className="break-words text-sm text-ink">
              {record.file_name} {record.file_size !== null && <span className="text-ink-soft tnum">({formatBytes(record.file_size)})</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={`/api/v1/records/${record.id}/file`} className="inline-flex min-h-control items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium text-teal-700 hover:bg-mint-100">
                <Download className="h-4 w-4" aria-hidden /> Download {record.file_name}
              </a>
              <Button variant="ghost" onClick={() => pick.current?.click()}>Replace file</Button>
              <Button variant="ghost" onClick={() => setConfirm("removeFile")}>Remove file</Button>
            </div>
            <p className="text-xs text-ink-soft">Downloads are recorded in your access log. {REPLACE_RESETS_NOTICE}</p>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => pick.current?.click()}>
              <Paperclip className="h-4 w-4" aria-hidden /> Attach file
            </Button>
            <p className="text-xs text-ink-soft">PDF, PNG or JPEG, up to 10 MB. {REPLACE_RESETS_NOTICE}</p>
          </>
        )}
      </section>

      <section aria-label="Remove" className="border-t border-line pt-4">
        <Button variant="ghost" aria-label={`Remove ${record.title} (entered in error)`} onClick={() => setConfirm("remove")}>
          <Trash2 className="h-4 w-4" aria-hidden /> Remove as entered in error
        </Button>
        <p className="mt-1 text-xs text-ink-soft">Records are hidden, not erased, so your history stays complete.</p>
      </section>

      <ConfirmationDialog
        open={confirm === "remove"}
        destructive
        loading={busy}
        title={`Remove “${record.title}”?`}
        confirmLabel="Remove record"
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void run(async () => void (await api(`/records/${record.id}`, { method: "PATCH", body: { status: "entered_in_error" } })), "Record removed.").then((ok) => {
            setConfirm(null);
            if (ok) onClose();
          })
        }
      >
        It will be hidden from your list and marked “entered in error”. It is not erased.
      </ConfirmationDialog>
      <ConfirmationDialog
        open={confirm === "removeFile"}
        destructive
        loading={busy}
        title="Remove the attached file?"
        confirmLabel="Remove file"
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void run(async () => void (await api(`/records/${record.id}/file`, { method: "DELETE" })), "File removed.").then(() => setConfirm(null))
        }
      >
        The record stays; only its file is taken off.
      </ConfirmationDialog>
    </div>
  );
}
