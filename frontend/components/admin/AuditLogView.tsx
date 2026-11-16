"use client";

import { useState } from "react";
import { Alert, Button, Card, EmptyState, PageLoading, SelectField, TextField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { actionLabel, dayEndIso, dayStartIso, type AuditRow } from "@/lib/admin";
import { useAsync } from "@/lib/hooks";
import type { Page } from "@/lib/types";

const PAGE = 25;
const GROUPS = [
  { value: "", label: "All visible events" },
  { value: "admin.", label: "Administration" },
  { value: "auth.", label: "Sign-in and accounts" },
  { value: "feedback.", label: "Feedback" },
];

export function AuditLogView() {
  const [group, setGroup] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);

  const log = useAsync(() => {
    const q = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (group) q.set("action", group);
    const since = dayStartIso(from);
    const until = dayEndIso(to);
    if (since) q.set("since", since);
    if (until) q.set("until", until);
    return api<Page<AuditRow>>(`/admin/audit-logs?${q}`);
  }, [group, from, to, offset]);

  const total = log.data?.total ?? 0;
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + PAGE, total);

  return (
    <Card aria-labelledby="audit-h" className="space-y-4">
      <div>
        <h2 id="audit-h" className="text-lg font-semibold text-ink">
          Audit log
        </h2>
        <p className="text-sm text-ink-soft">
          Administration, sign-in and feedback events, newest first. Events about patients’ own health data are not
          shown here. Entries cannot be edited or deleted. Opening this page is itself recorded.
        </p>
      </div>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
        <SelectField
          label="Type of event"
          value={group}
          options={GROUPS}
          onChange={(e) => {
            setGroup(e.target.value);
            setOffset(0);
          }}
        />
        <TextField label="From" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setOffset(0); }} />
        <TextField label="To" type="date" value={to} onChange={(e) => { setTo(e.target.value); setOffset(0); }} />
      </form>

      {log.loading && !log.data ? (
        <PageLoading label="Loading audit log" />
      ) : !log.data ? (
        <Alert tone="danger" title="Could not load the audit log">
          {errorMessage(log.error)}
        </Alert>
      ) : log.data.items.length === 0 ? (
        <EmptyState title="No events match">Try a wider date range or another type of event.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Audit events, newest first</caption>
            <thead>
              <tr className="border-b border-line text-ink-soft">
                <th scope="col" className="py-2 pr-3 font-medium">When</th>
                <th scope="col" className="py-2 pr-3 font-medium">Event</th>
                <th scope="col" className="py-2 pr-3 font-medium">By</th>
                <th scope="col" className="py-2 pr-3 font-medium">About</th>
                <th scope="col" className="py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {log.data.items.map((e) => (
                <tr key={e.id} className="border-b border-line/60 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString()}</time>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="font-medium text-ink">{actionLabel(e.action)}</span>
                    <span className="block text-xs text-ink-soft">{e.action}</span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs break-all">{e.actor_user_id?.slice(0, 8) ?? "system"}</td>
                  <td className="py-2 pr-3 text-xs break-all">
                    {e.resource_type ?? "—"}
                    {e.resource_id ? ` ${e.resource_id.slice(0, 8)}` : ""}
                  </td>
                  <td className="py-2 font-mono text-xs break-all">
                    {Object.keys(e.metadata).length ? JSON.stringify(e.metadata) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="text-sm text-ink-soft">
          {total === 0 ? "No events" : `Showing ${first}–${last} of ${total}`}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Newer
          </Button>
          <Button variant="secondary" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
            Older
          </Button>
        </div>
      </div>
    </Card>
  );
}
