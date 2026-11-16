"use client";

import { useState } from "react";
import { Alert, Button, Card, EmptyState, PageLoading } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useAsync } from "@/lib/hooks";
import {
  EVENT_LABEL,
  STATUS_LABEL,
  categoryLabel,
  rangeText,
  timeLeft,
  type AccessLogEntry,
  type Share,
} from "@/lib/sharing";
import type { Page } from "@/lib/types";

const BADGE = {
  active: "bg-success-100 text-success-700",
  expired: "bg-amber-100 text-amber-600",
  revoked: "bg-danger-100 text-danger-700",
} as const;

function AccessLog({ id }: { id: string }) {
  const log = useAsync(() => api<Page<AccessLogEntry>>(`/shares/${id}/access`), [id]);
  if (log.loading && !log.data) return <p className="text-sm text-ink-soft">Loading…</p>;
  if (!log.data) return <p className="text-sm text-danger-700">Could not load the access log.</p>;
  if (log.data.items.length === 0) return <p className="text-sm text-ink-soft">Nobody has used this link yet.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {log.data.items.map((e) => (
        <li key={e.id} className="flex flex-wrap gap-x-3 text-ink">
          <time dateTime={e.created_at} className="text-ink-soft">
            {new Date(e.created_at).toLocaleString()}
          </time>
          <span>{EVENT_LABEL[e.event]}</span>
        </li>
      ))}
    </ul>
  );
}

export function ShareList({ version, onChanged }: { version: number; onChanged: () => void }) {
  const shares = useAsync(() => api<Page<Share>>("/shares"), [version]);
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function revoke(id: string) {
    setBusy(id);
    setFailure(null);
    try {
      await api(`/shares/${id}/revoke`, { method: "POST" });
      setConfirming(null);
      await shares.reload();
      onChanged();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (shares.loading && !shares.data) return <PageLoading label="Loading your shares" />;
  if (!shares.data) return <Alert tone="danger" title="Could not load your shares">Check your connection and try again.</Alert>;

  return (
    <Card aria-labelledby="share-list-h" className="space-y-4">
      <h2 id="share-list-h" className="text-lg font-semibold text-ink">
        Who can see your records
      </h2>
      {failure && (
        <Alert tone="danger" title="Not changed">
          {failure}
        </Alert>
      )}
      {shares.data.items.length === 0 ? (
        <EmptyState title="You have not shared anything">Nobody else can see your records.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {shares.data.items.map((s) => {
            const range = rangeText(s.date_from, s.date_to);
            return (
              <li key={s.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">
                      {s.recipient_name} <span className="font-normal text-ink-soft">{s.recipient_email}</span>
                    </p>
                    <p className="text-sm text-ink-soft">
                      {s.categories.map(categoryLabel).join(", ")}
                      {range ? `. ${range}` : ""}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", BADGE[s.status])}>{STATUS_LABEL[s.status]}</span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  {s.status === "active" ? timeLeft(s.expires_at) : s.status === "revoked" ? "You withdrew this share." : "This share has ended."}{" "}
                  Opened {s.access_count} {s.access_count === 1 ? "time" : "times"}
                  {s.last_accessed_at ? `, last on ${new Date(s.last_accessed_at).toLocaleString()}` : ""}.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="secondary" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
                    {open === s.id ? "Hide access log" : "Access log"}
                  </Button>
                  {s.status === "active" &&
                    (confirming === s.id ? (
                      <>
                        <Button variant="danger" loading={busy === s.id} onClick={() => void revoke(s.id)}>
                          Yes, withdraw access
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirming(null)}>
                          Keep sharing
                        </Button>
                      </>
                    ) : (
                      <Button variant="secondary" onClick={() => setConfirming(s.id)}>
                        Withdraw access
                      </Button>
                    ))}
                </div>
                {open === s.id && (
                  <div className="mt-3 border-t border-line pt-3">
                    <AccessLog id={s.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
