"use client";

import { FileText, Paperclip, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AddRecordForm } from "@/components/records/AddRecordForm";
import { RecordDrawer } from "@/components/records/RecordDrawer";
import { Alert, Button, Card, EmptyState, SelectField, Skeleton, TextField, VerificationBadge } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/Drawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api-client";
import { TABLE_QUERY, useAsync, useMediaQuery } from "@/lib/hooks";
import { filterRecords, formatDate, RECORD_TYPES, recordTypeLabel } from "@/lib/records";
import type { HealthRecord, Page } from "@/lib/types";

const FILTERS = [{ value: "", label: "All types" }, ...RECORD_TYPES];
const LIMIT = 100;

function Row({ r, onOpen }: { r: HealthRecord; onOpen: (r: HealthRecord) => void }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="max-w-xs p-3 text-left font-medium text-ink">
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
          <span className="break-words">{r.title}</span>
        </span>
      </th>
      <td className="p-3 text-sm text-ink">{recordTypeLabel(r.record_type)}</td>
      <td className="p-3 text-sm text-ink tnum">{formatDate(r.record_date)}</td>
      <td className="p-3 text-sm text-ink">{r.provider_name ?? <span className="text-ink-soft">Not set</span>}</td>
      <td className="p-3"><VerificationBadge status={r.verification_status} /></td>
      <td className="p-3 text-sm text-ink">
        {r.has_file ? (
          <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" aria-hidden /> File attached</span>
        ) : (
          <span className="text-ink-soft">No file</span>
        )}
      </td>
      <td className="p-3 text-right">
        <Button variant="secondary" aria-label={`Open details for ${r.title}`} onClick={() => onOpen(r)}>
          Details
        </Button>
      </td>
    </tr>
  );
}

function RecordCard({ r, onOpen }: { r: HealthRecord; onOpen: (r: HealthRecord) => void }) {
  return (
    <li className="space-y-2 p-3">
      <p className="flex items-center gap-2 font-medium text-ink">
        <FileText className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
        <span className="break-words">{r.title}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <span>{recordTypeLabel(r.record_type)}</span>
        <span className="tnum">{formatDate(r.record_date)}</span>
        {r.provider_name && <span>{r.provider_name}</span>}
        <VerificationBadge status={r.verification_status} />
        {r.has_file && <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" aria-hidden /> File attached</span>}
      </div>
      {r.notes && <p className="line-clamp-2 text-sm text-ink-soft">{r.notes}</p>}
      <Button variant="secondary" aria-label={`Open details for ${r.title}`} onClick={() => onOpen(r)}>
        Details
      </Button>
    </li>
  );
}

export function RecordsSection() {
  const { show } = useToast();
  const wide = useMediaQuery(TABLE_QUERY);
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ tone: "warning" | "success"; text: string } | null>(null);
  const list = useAsync(() => api<Page<HealthRecord>>(`/records?limit=${LIMIT}${type ? `&record_type=${type}` : ""}`), [type]);

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const shown = useMemo(() => filterRecords(items, { query, from, to }), [items, query, from, to]);
  const open = openId ? (items.find((r) => r.id === openId) ?? null) : null;
  const narrowed = Boolean(query.trim() || from || to);
  const dateError = from && to && from > to ? "The start date is after the end date." : undefined;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add record
        </Button>
      </div>

      <Drawer open={adding} onClose={() => setAdding(false)} title="Add a record" closeLabel="Close add record" className="sm:w-[30rem]">
        <AddRecordForm
          bare
          onSaved={(text, tone) => {
            setAdding(false);
            if (tone === "success") show(text, "success");
            else setNotice({ tone, text });
            void list.reload();
          }}
        />
      </Drawer>

      {notice && (
        <Alert tone={notice.tone} title={notice.tone === "success" ? "Done" : undefined}>
          {notice.text}
        </Alert>
      )}

      <Card aria-labelledby="your-records">
        <h2 id="your-records" className="mb-4 text-h3 font-semibold text-navy-900">
          Your records
        </h2>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value)} options={FILTERS} />
          <TextField label="Search loaded records" type="search" value={query} onChange={(e) => setQuery(e.target.value)} hint="Title, doctor, notes" />
          <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} error={dateError} />
          <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        {list.error && !list.data ? (
          <ErrorState title="Couldn’t load your records" onRetry={() => void list.reload()}>
            {errorMessage(list.error)}
          </ErrorState>
        ) : list.loading && !list.data ? (
          <div className="space-y-2" role="status" aria-label="Loading records">
            <Skeleton variant="row" />
            <Skeleton variant="row" />
            <Skeleton variant="row" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title={type ? "No records of this type" : "No records yet"} icon={Search}>
            Add a report, prescription or scan above. Only you can see them.
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState title="No records match" icon={Search}>
            Nothing among the {items.length} loaded matches{dateError ? "" : " these filters"}. Records with no date are left out when a date range is set.
          </EmptyState>
        ) : wide ? (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[40rem] text-left">
              <caption className="sr-only">Your records</caption>
              <thead className="bg-canvas text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th scope="col" className="p-3">Title</th>
                  <th scope="col" className="p-3">Type</th>
                  <th scope="col" className="p-3">Date</th>
                  <th scope="col" className="p-3">Doctor or lab</th>
                  <th scope="col" className="p-3">Status</th>
                  <th scope="col" className="p-3">File</th>
                  <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>{shown.map((r) => <Row key={r.id} r={r} onOpen={(x) => setOpenId(x.id)} />)}</tbody>
            </table>
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {shown.map((r) => <RecordCard key={r.id} r={r} onOpen={(x) => setOpenId(x.id)} />)}
          </ul>
        )}

        {list.data && items.length > 0 && (
          <p role="status" className="mt-3 text-xs text-ink-soft tnum">
            {narrowed ? `${shown.length} of ${items.length} loaded records shown.` : `${items.length} ${items.length === 1 ? "record" : "records"} shown.`}
            {list.data.total > items.length && ` Only the newest ${items.length} of ${list.data.total} are loaded; use the type filter to narrow further.`}
          </p>
        )}
      </Card>

      <RecordDrawer record={open} onClose={() => setOpenId(null)} onChanged={() => list.reload()} />
    </div>
  );
}
