"use client";

import { useMemo, useState } from "react";
import { uploadRecordFile } from "@/components/records/AddRecordForm";
import { Alert, Button, CheckboxField, TextField } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { todayISO } from "@/lib/records";
import { bulkLabsBody, CONFIDENCE_LABEL, dateProblem, reviewProblems, reviewRows, SCAN_CHECK_NOTICE, type ReviewRow, type ScanResult } from "@/lib/scan";
import type { HealthRecord, LabResult } from "@/lib/types";

/**
 * Review step for the results found on a scanned report. Each row is the same set of fields as the
 * single "Add a result" form. Nothing is saved until Save; unticked rows are never sent; the
 * reference range is only what was printed on the report, and the flag is worked out by the server.
 *
 * With `recordId` the results are linked to that existing record. Without it, and with a `file`,
 * the patient can also keep the report itself in Records (created first, then the file, then the
 * results), and the results link to it.
 */
export function LabImport({
  scan,
  file,
  recordId = null,
  onDone,
  onCancel,
}: {
  scan: ScanResult;
  file: File | null;
  recordId?: string | null;
  onDone: (saved: LabResult[], note?: string) => void;
  onCancel: () => void;
}) {
  const [observedOn, setObservedOn] = useState(scan.record.record_date && scan.record.record_date <= todayISO() ? scan.record.record_date : "");
  const [rows, setRows] = useState<ReviewRow[]>(() => reviewRows(scan, scan.record.record_date ?? ""));
  const [keepFile, setKeepFile] = useState(Boolean(file) && !recordId);
  const [title, setTitle] = useState(scan.record.title ?? "Lab report");
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<"idle" | "record" | "file" | "results">("idle");

  const problems = useMemo(() => reviewProblems(rows, observedOn), [rows, observedOn]);
  const picked = rows.filter((r) => r.include).length;
  const dateErr = tried ? dateProblem(observedOn) : null;
  const titleErr = tried && keepFile && !title.trim() ? "Give the report a title." : null;

  const patch = (key: number, change: Partial<ReviewRow["form"]>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, form: { ...r.form, ...change } } : r)));
  const toggle = (key: number, include: boolean) => setRows((all) => all.map((r) => (r.key === key ? { ...r, include } : r)));

  async function save() {
    setTried(true);
    setFailure(null);
    setServerErrors({});
    if (picked === 0) return setFailure("Tick at least one result to save.");
    if (dateProblem(observedOn) || problems.size > 0 || (keepFile && !title.trim())) return;

    let linkTo = recordId;
    let created: HealthRecord | null = null;
    let stage: "record" | "file" | "results" = "record"; // local: `saving` is stale inside this closure
    try {
      if (keepFile && file && !recordId) {
        setSaving("record");
        created = await api<HealthRecord>("/records", {
          method: "POST",
          body: { record_type: "lab_report", title: title.trim(), record_date: observedOn, provider_name: scan.record.provider_name, notes: null },
        });
        linkTo = created.id;
        stage = "file";
        setSaving("file");
        await uploadRecordFile(created.id, file);
      }
      stage = "results";
      setSaving("results");
      const saved = await api<LabResult[]>("/labs/bulk", { method: "POST", body: bulkLabsBody(rows, observedOn, linkTo) });
      onDone(saved);
    } catch (err) {
      setServerErrors(fieldErrors(err));
      const why = errorMessage(err);
      if (created && stage === "file") {
        // The report exists but its file did not attach, and the results were not saved.
        setFailure(`The report was saved in Records, but its file didn’t attach and the results weren’t saved: ${why} Try again, or attach the file from Records.`);
        setKeepFile(false);
      } else if (created) {
        setFailure(`The report was saved in Records, but the results weren’t saved: ${why} Nothing was added to Lab results. You can press Save to try again.`);
        setKeepFile(false);
      } else {
        setFailure(why);
      }
    } finally {
      setSaving("idle");
    }
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="No results were found">
          The report was read, but no test rows could be told apart. You can add results one at a time with “Add result”.
        </Alert>
        <Button variant="secondary" onClick={onCancel}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert tone="warning" title="Check before saving">
        {SCAN_CHECK_NOTICE} Untick anything that isn’t a result you want to keep.
      </Alert>
      {scan.warnings.map((w) => (
        <p key={w} className="text-sm text-ink-soft">
          {w}
        </p>
      ))}

      <TextField label="Test date" type="date" max={todayISO()} value={observedOn} onChange={(e) => setObservedOn(e.target.value)} error={dateErr ?? serverErrors.observed_on ?? undefined} hint={scan.record.record_date ? "Read from the report. It applies to every result below." : "Not found on the report. Enter the date the sample was taken."} />

      {file && !recordId && (
        <div className="space-y-3 rounded-lg border border-line p-3">
          <CheckboxField label="Also keep this report in Records" description="Saves the file as a lab report and links these results to it." checked={keepFile} onChange={(e) => setKeepFile(e.target.checked)} disabled={saving !== "idle"} />
          {keepFile && <TextField label="Report title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} error={titleErr ?? undefined} />}
        </div>
      )}

      <ul className="space-y-3" aria-label="Results found on the report">
        {rows.map((r) => {
          const p = problems.get(r.key) ?? {};
          const show = tried ? p : {};
          return (
            <li key={r.key} className={`space-y-3 rounded-lg border p-3 ${r.include ? "border-line" : "border-line bg-canvas opacity-70"}`}>
              <CheckboxField label={r.form.test_name || "Result"} description={CONFIDENCE_LABEL[r.confidence]} checked={r.include} onChange={(e) => toggle(r.key, e.target.checked)} disabled={saving !== "idle"} />
              {r.include && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Test name" value={r.form.test_name} onChange={(e) => patch(r.key, { test_name: e.target.value })} error={show.test_name} maxLength={200} />
                  <TextField label="Result" value={r.form.result} onChange={(e) => patch(r.key, { result: e.target.value })} error={show.result} maxLength={200} />
                  <TextField label="Unit" optional value={r.form.unit} onChange={(e) => patch(r.key, { unit: e.target.value })} maxLength={40} />
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Range low" optional inputMode="decimal" value={r.form.ref_low} onChange={(e) => patch(r.key, { ref_low: e.target.value })} error={show.ref_low} />
                    <TextField label="Range high" optional inputMode="decimal" value={r.form.ref_high} onChange={(e) => patch(r.key, { ref_high: e.target.value })} error={show.ref_high} />
                  </div>
                  <p className="text-xs text-ink-soft sm:col-span-2">
                    Read from: <span className="break-words font-mono">{r.source_line}</span>
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {failure && <Alert tone="danger">{failure}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} loading={saving !== "idle"}>
          Save {picked} result{picked === 1 ? "" : "s"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving !== "idle"}>
          Cancel
        </Button>
        <span role="status" className="text-sm text-ink-soft">
          {saving === "record" ? "Saving the report…" : saving === "file" ? "Uploading the file…" : saving === "results" ? "Saving results…" : ""}
        </span>
      </div>
      <p className="text-xs text-ink-soft">Results you add are marked “Patient reported”. Whether a value is above or below the report’s range is worked out from the range you confirm here, and is not a diagnosis.</p>
    </div>
  );
}
