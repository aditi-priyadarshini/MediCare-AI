"use client";

import { useState } from "react";
import { Alert, Button, Card, EmptyState, PageLoading, SelectField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { CATEGORY_LABEL, type AdminFeedbackRow, type FeedbackStatus } from "@/lib/admin";
import { useAsync } from "@/lib/hooks";
import type { Page } from "@/lib/types";

const FILTERS = [
  { value: "new", label: "New" },
  { value: "reviewed", label: "Read" },
  { value: "actioned", label: "Acted on" },
  { value: "dismissed", label: "Closed" },
  { value: "all", label: "All" },
];

function Item({ item, onDone }: { item: AdminFeedbackRow; onDone: () => void }) {
  const [note, setNote] = useState(item.moderator_note ?? "");
  const [busy, setBusy] = useState<FeedbackStatus | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const noteId = `note-${item.id}`;

  async function set(status: FeedbackStatus) {
    setBusy(status);
    setFailure(null);
    try {
      await api(`/admin/feedback/${item.id}/moderate`, { method: "POST", body: { status, note: note.trim() || null } });
      onDone();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-soft">
        <span>
          {CATEGORY_LABEL[item.category]}
          {item.page ? ` · ${item.page}` : ""} · from account {item.user_id.slice(0, 8)}
        </span>
        <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
      </div>
      {/* Rendered as plain text: React escapes it, so pasted markup is shown, never run. */}
      <p className="mt-2 whitespace-pre-wrap break-words text-ink">{item.message}</p>
      <div className="mt-3 space-y-2">
        <label htmlFor={noteId} className="block text-sm font-medium text-ink">
          Internal note <span className="font-normal text-ink-soft">(never shown to the sender)</span>
        </label>
        <textarea
          id={noteId}
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[72px] w-full rounded-lg border border-line bg-surface px-3 py-2 text-base"
        />
        {failure && (
          <Alert tone="danger" title="Not saved">
            {failure}
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          {item.status !== "reviewed" && (
            <Button variant="secondary" loading={busy === "reviewed"} onClick={() => void set("reviewed")}>
              Mark as read
            </Button>
          )}
          {item.status !== "actioned" && (
            <Button loading={busy === "actioned"} onClick={() => void set("actioned")}>
              Mark as acted on
            </Button>
          )}
          {item.status !== "dismissed" && (
            <Button variant="secondary" loading={busy === "dismissed"} onClick={() => void set("dismissed")}>
              Close without action
            </Button>
          )}
          {item.status !== "new" && (
            <Button variant="ghost" loading={busy === "new"} onClick={() => void set("new")}>
              Reopen
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export function FeedbackModeration() {
  const [status, setStatus] = useState("new");
  const q = useAsync(() => api<Page<AdminFeedbackRow>>(`/admin/feedback?status=${status}&limit=50`), [status]);

  return (
    <Card aria-labelledby="fb-h" className="space-y-4">
      <div>
        <h2 id="fb-h" className="text-lg font-semibold text-ink">
          Feedback
        </h2>
        <p className="text-sm text-ink-soft">
          Messages about the app itself. Names and emails are not shown. Reports of a medicine reaction are separate
          and private to the patient.
        </p>
      </div>
      <SelectField label="Show" value={status} options={FILTERS} onChange={(e) => setStatus(e.target.value)} />
      {q.loading && !q.data ? (
        <PageLoading label="Loading feedback" />
      ) : !q.data ? (
        <Alert tone="danger" title="Could not load feedback">
          {errorMessage(q.error)}
        </Alert>
      ) : q.data.items.length === 0 ? (
        <EmptyState title="Nothing here">No feedback with this status.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {q.data.items.map((f) => (
            <Item key={f.id} item={f} onDone={() => void q.reload()} />
          ))}
        </ul>
      )}
    </Card>
  );
}
