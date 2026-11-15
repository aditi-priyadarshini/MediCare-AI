"use client";

import { Download, FileText, Paperclip, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  SelectField,
  Skeleton,
  TextField,
  VerificationBadge,
} from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { checkUpload, formatBytes, formatDate, RECORD_TYPES, recordTypeLabel, todayISO } from "@/lib/records";
import type { HealthRecord, Page, RecordType } from "@/lib/types";

const FILTERS = [{ value: "", label: "All types" }, ...RECORD_TYPES];

const empty = { record_type: "lab_report" as RecordType, title: "", record_date: "", provider_name: "", notes: "" };

async function uploadFile(id: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  await api<HealthRecord>(`/records/${id}/file`, { method: "POST", body });
}

export function RecordsSection() {
  const [filter, setFilter] = useState("");
  const list = useAsync(() => api<Page<HealthRecord>>(`/records${filter ? `?record_type=${filter}` : ""}`), [filter]);
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "danger" | "warning" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replaceFor, setReplaceFor] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "Give this record a title.";
    const fileProblem = file ? checkUpload(file) : null;
    if (fileProblem) next.file = fileProblem;
    setErrors(next);
    setNotice(null);
    if (Object.keys(next).length) return;

    setBusy(true);
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
      if (file) await uploadFile(created.id, file);
      setForm(empty);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setNotice({ tone: "success", text: "Record saved." });
    } catch (err) {
      if (created) {
        // The record exists; only the file failed. Say so rather than implying nothing was saved.
        setForm(empty);
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
        setNotice({
          tone: "warning",
          text: `The record was saved, but the file wasn’t attached: ${errorMessage(err)} You can attach it from the list below.`,
        });
      } else {
        setErrors(fieldErrors(err));
        setNotice({ tone: "danger", text: errorMessage(err) });
      }
    } finally {
      setBusy(false);
      await list.reload();
    }
  }

  async function act(fn: () => Promise<void>) {
    setNotice(null);
    try {
      await fn();
      await list.reload();
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    }
  }

  function onReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    const id = replaceFor;
    e.target.value = "";
    if (!f || !id) return;
    const problem = checkUpload(f);
    if (problem) return setNotice({ tone: "danger", text: problem });
    void act(() => uploadFile(id, f));
  }

  return (
    <div className="space-y-6">
      <Card aria-labelledby="add-record">
        <h2 id="add-record" className="mb-4 font-semibold text-navy-900">
          Add a record
        </h2>
        <form onSubmit={(e) => void add(e)} noValidate className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Type"
            value={form.record_type}
            onChange={(e) => set("record_type", e.target.value as RecordType)}
            options={RECORD_TYPES}
          />
          <TextField label="Title" value={form.title} onChange={(e) => set("title", e.target.value)} error={errors.title} maxLength={200} hint="For example: Blood test, March" />
          <TextField label="Date" optional type="date" max={todayISO()} value={form.record_date} onChange={(e) => set("record_date", e.target.value)} error={errors.record_date} />
          <TextField label="Doctor or lab" optional value={form.provider_name} onChange={(e) => set("provider_name", e.target.value)} maxLength={200} />
          <div className="sm:col-span-2">
            <TextField label="Notes" optional value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
          </div>
          <div className="sm:col-span-2">
            <TextField
              ref={fileInput}
              label="File"
              optional
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              error={errors.file}
              hint="PDF, PNG or JPEG, up to 10 MB."
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy}>
              <Plus className="h-4 w-4" aria-hidden /> Save record
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-ink-soft">
          Use synthetic or your own non-sensitive test files while this app is in its academic build.
        </p>
      </Card>

      {notice && (
        <Alert tone={notice.tone} title={notice.tone === "success" ? "Done" : undefined}>
          {notice.text}
        </Alert>
      )}

      <Card aria-labelledby="your-records">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="your-records" className="font-semibold text-navy-900">
            Your records
          </h2>
          <div className="w-52">
            <SelectField label="Show" value={filter} onChange={(e) => setFilter(e.target.value)} options={FILTERS} />
          </div>
        </div>
        <input
          ref={replaceInput}
          type="file"
          hidden
          accept="application/pdf,image/png,image/jpeg"
          onChange={onReplace}
          aria-label="Choose a file to attach"
        />
        {list.error ? (
          <Alert tone="danger">{errorMessage(list.error)}</Alert>
        ) : list.loading && !list.data ? (
          <Skeleton className="h-20 w-full" />
        ) : list.data && list.data.items.length > 0 ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {list.data.items.map((r) => (
              <li key={r.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-ink">
                      <FileText className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
                      <span className="break-words">{r.title}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                      <span>{recordTypeLabel(r.record_type)}</span>
                      <span>{formatDate(r.record_date)}</span>
                      {r.provider_name && <span>{r.provider_name}</span>}
                      <VerificationBadge status={r.verification_status} />
                    </div>
                    {r.notes && <p className="mt-1 text-sm text-ink-soft">{r.notes}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    aria-label={`Remove ${r.title} (entered in error)`}
                    onClick={() =>
                      void act(async () => {
                        await api(`/records/${r.id}`, { method: "PATCH", body: { status: "entered_in_error" } });
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden /> Remove
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {r.has_file ? (
                    <>
                      <a
                        href={`/api/v1/records/${r.id}/file`}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-line px-3 font-medium text-teal-700 hover:bg-mint-100"
                      >
                        <Download className="h-4 w-4" aria-hidden />
                        Download {r.file_name}
                        {r.file_size !== null && <span className="text-ink-soft">({formatBytes(r.file_size)})</span>}
                      </a>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setReplaceFor(r.id);
                          replaceInput.current?.click();
                        }}
                      >
                        Replace file
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => void act(async () => void (await api(`/records/${r.id}/file`, { method: "DELETE" })))}
                      >
                        Remove file
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setReplaceFor(r.id);
                        replaceInput.current?.click();
                      }}
                    >
                      <Paperclip className="h-4 w-4" aria-hidden /> Attach file
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={filter ? "No records of this type" : "No records yet"}>
            Add a report, prescription or scan above. Only you can see them.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
