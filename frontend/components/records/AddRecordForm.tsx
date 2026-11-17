"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { FileDropzone } from "@/components/records/FileDropzone";
import { Alert, Button, Card, SelectField, TextField } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { RECORD_TYPES, todayISO } from "@/lib/records";
import type { HealthRecord, RecordType } from "@/lib/types";
import { checkUpload } from "@/lib/records";

const empty = { record_type: "lab_report" as RecordType, title: "", record_date: "", provider_name: "", notes: "" };

export async function uploadRecordFile(id: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  await api<HealthRecord>(`/records/${id}/file`, { method: "POST", body });
}

/**
 * Creates a record, then attaches the file if one was chosen (two calls, as before). If only the
 * file fails the record still exists, and the message says so instead of implying nothing was saved.
 */
export function AddRecordForm({ onSaved }: { onSaved: (message: string, tone: "success" | "warning") => void }) {
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "uploading">("idle");

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const reset = () => {
    setForm(empty);
    setFile(null);
    setFileKey((k) => k + 1); // remounts the picker so its native value is cleared too
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "Give this record a title.";
    const fileProblem = file ? checkUpload(file) : null;
    if (fileProblem) next.file = fileProblem;
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length) return;

    setState("saving");
    let created: HealthRecord | null = null;
    try {
      created = await api<HealthRecord>("/records", {
        method: "POST",
        body: {
          record_type: form.record_type,
          title: form.title.trim(),
          record_date: form.record_date || null,
          provider_name: form.provider_name.trim() || null,
          notes: form.notes.trim() || null,
        },
      });
      if (file) {
        setState("uploading");
        await uploadRecordFile(created.id, file);
      }
      reset();
      onSaved("Record saved.", "success");
    } catch (err) {
      if (created) {
        reset();
        onSaved(`The record was saved, but the file wasn’t attached: ${errorMessage(err)} You can attach it from the list below.`, "warning");
      } else {
        setErrors(fieldErrors(err));
        setFailure(errorMessage(err));
      }
    } finally {
      setState("idle");
    }
  }

  return (
    <Card aria-labelledby="add-record">
      <h2 id="add-record" className="mb-4 text-h3 font-semibold text-navy-900">
        Add a record
      </h2>
      <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" value={form.record_type} onChange={(e) => set("record_type", e.target.value as RecordType)} options={RECORD_TYPES} />
        <TextField label="Title" value={form.title} onChange={(e) => set("title", e.target.value)} error={errors.title} maxLength={200} hint="For example: Blood test, March" />
        <TextField label="Date" optional type="date" max={todayISO()} value={form.record_date} onChange={(e) => set("record_date", e.target.value)} error={errors.record_date} />
        <TextField label="Doctor or lab" optional value={form.provider_name} onChange={(e) => set("provider_name", e.target.value)} maxLength={200} />
        <div className="sm:col-span-2">
          <TextField label="Notes" optional value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
        </div>
        <div className="sm:col-span-2">
          <FileDropzone key={fileKey} file={file} onFile={setFile} error={errors.file} disabled={state !== "idle"} />
        </div>
        {failure && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{failure}</Alert>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" loading={state !== "idle"}>
            <Plus className="h-4 w-4" aria-hidden /> Save record
          </Button>
          <span role="status" className="text-sm text-ink-soft">
            {state === "saving" ? "Saving the record…" : state === "uploading" ? "Uploading the file…" : ""}
          </span>
        </div>
      </form>
      <p className="mt-3 text-xs text-ink-soft">
        Records you add are marked “Patient reported”. Use synthetic or your own non-sensitive test files while this app is in its academic build.
      </p>
    </Card>
  );
}
