"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { FileDropzone } from "@/components/records/FileDropzone";
import { ScanCapture } from "@/components/records/ScanCapture";
import { Alert, Button, Card, SelectField, TextField } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { RECORD_TYPES, todayISO } from "@/lib/records";
import type { HealthRecord, RecordType } from "@/lib/types";
import { checkUpload } from "@/lib/records";
import { applyScanToRecord, filledSummary, SCAN_CHECK_NOTICE, type ScanResult } from "@/lib/scan";

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
export function AddRecordForm({
  onSaved,
  bare,
}: {
  /** `saved` is set when a record was created; `scan` is set when the form was filled from a scan, so the page can offer the lab results found on it. */
  onSaved: (message: string, tone: "success" | "warning", saved?: { record: HealthRecord; scan: ScanResult | null }) => void;
  bare?: boolean;
}) {
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "uploading">("idle");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const reset = () => {
    setForm(empty);
    setFile(null);
    setScan(null);
    setScanNote(null);
    setFileKey((k) => k + 1); // remounts the picker so its native value is cleared too
  };

  /** A scan fills only what it found, attaches the scanned file, and says what to check. */
  function applyScan(scanned: File, result: ScanResult) {
    const { next, filled } = applyScanToRecord(form, result);
    setForm(next);
    setFile(scanned);
    setFileKey((k) => k + 1);
    setErrors({});
    setScan(result);
    setScanNote(
      result.text_found && filled.length > 0
        ? `Filled in: ${filledSummary(filled)}. ${SCAN_CHECK_NOTICE}`
        : result.text_found
          ? "The report was read but no details could be filled in. Please enter them yourself; the file is attached."
          : "No text could be read from that file, so nothing was filled in. The file is attached; please enter the details yourself.",
    );
  }

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
      const usedScan = scan;
      reset();
      onSaved("Record saved.", "success", { record: created, scan: usedScan });
    } catch (err) {
      if (created) {
        const usedScan = scan;
        reset();
        onSaved(`The record was saved, but the file wasn’t attached: ${errorMessage(err)} You can attach it from the list below.`, "warning", { record: created, scan: usedScan });
      } else {
        setErrors(fieldErrors(err));
        setFailure(errorMessage(err));
      }
    } finally {
      setState("idle");
    }
  }

  const scanner = (
    <div className="space-y-3">
      <ScanCapture onScanned={applyScan} disabled={state !== "idle"} description="Take a photo of a report or prescription, or choose a file, and this form is filled in for you to check." />
      {scanNote && (
        <p role="status" className="rounded-lg bg-mint-100 px-3 py-2 text-sm text-ink">
          {scanNote}
        </p>
      )}
    </div>
  );

  const fields = (
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
  );

  const footnote = (
    <p className="mt-3 text-xs text-ink-soft">
      Records you add are marked “Patient reported”. Use synthetic or your own non-sensitive test files while this app is in its academic build.
    </p>
  );

  return bare ? (
    <div className="space-y-4">
      {scanner}
      <div>
        {fields}
        {footnote}
      </div>
    </div>
  ) : (
    <Card aria-labelledby="add-record">
      <h2 id="add-record" className="mb-4 text-h3 font-semibold text-navy-900">
        Add a record
      </h2>
      <div className="mb-4">{scanner}</div>
      {fields}
      {footnote}
    </Card>
  );
}
