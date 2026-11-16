"use client";

import { useState } from "react";
import { Alert, Button, Card, EmptyState, PageLoading } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { AdminUserRow } from "@/lib/admin";
import { useAsync } from "@/lib/hooks";
import type { Page } from "@/lib/types";

export function AccountsTable() {
  const { user: me } = useAuth();
  const [offset, setOffset] = useState(0);
  const users = useAsync(() => api<Page<AdminUserRow>>(`/admin/users?limit=25&offset=${offset}`), [offset]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function change(u: AdminUserRow, action: "deactivate" | "reactivate") {
    setBusy(u.id);
    setFailure(null);
    try {
      await api(`/admin/users/${u.id}/${action}`, { method: "POST" });
      setConfirm(null);
      await users.reload();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const total = users.data?.total ?? 0;
  return (
    <Card aria-labelledby="acc-h" className="space-y-4">
      <div>
        <h2 id="acc-h" className="text-lg font-semibold text-ink">
          Accounts
        </h2>
        <p className="text-sm text-ink-soft">
          Account details only: no health information. Deactivating an account signs that person out everywhere and
          stops them signing in; nothing is deleted. New administrators are created on the server, not here.
        </p>
      </div>
      {failure && (
        <Alert tone="danger" title="Not changed">
          {failure}
        </Alert>
      )}
      {users.loading && !users.data ? (
        <PageLoading label="Loading accounts" />
      ) : !users.data ? (
        <Alert tone="danger" title="Could not load accounts">
          {errorMessage(users.error)}
        </Alert>
      ) : users.data.items.length === 0 ? (
        <EmptyState title="No accounts" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Accounts</caption>
            <thead>
              <tr className="border-b border-line text-ink-soft">
                <th scope="col" className="py-2 pr-3 font-medium">Email</th>
                <th scope="col" className="py-2 pr-3 font-medium">Role</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 pr-3 font-medium">Joined</th>
                <th scope="col" className="py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.data.items.map((u) => (
                <tr key={u.id} className="border-b border-line/60 align-top">
                  <td className="py-2 pr-3 break-all">{u.email}</td>
                  <td className="py-2 pr-3">{u.role}</td>
                  <td className="py-2 pr-3">
                    {u.is_active ? "Active" : "Deactivated"}
                    {!u.email_verified && <span className="block text-xs text-ink-soft">Email not verified</span>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="py-2">
                    {u.id === me?.id ? (
                      <span className="text-ink-soft">This is you</span>
                    ) : !u.is_active ? (
                      <Button variant="secondary" loading={busy === u.id} onClick={() => void change(u, "reactivate")}>
                        Reactivate<span className="sr-only"> {u.email}</span>
                      </Button>
                    ) : confirm === u.id ? (
                      <span className="flex flex-wrap gap-2">
                        <Button variant="danger" loading={busy === u.id} onClick={() => void change(u, "deactivate")}>
                          Yes, deactivate<span className="sr-only"> {u.email}</span>
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirm(null)}>
                          Cancel
                        </Button>
                      </span>
                    ) : (
                      <Button variant="secondary" onClick={() => setConfirm(u.id)}>
                        Deactivate<span className="sr-only"> {u.email}</span>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="text-sm text-ink-soft">
          {total} {total === 1 ? "account" : "accounts"}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>
            Previous
          </Button>
          <Button variant="secondary" disabled={offset + 25 >= total} onClick={() => setOffset(offset + 25)}>
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}
