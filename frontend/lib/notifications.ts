"use client";

import { useCallback, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import type { AppNotification, Page } from "@/lib/types";

/**
 * Real reminders from GET /notifications (due now or earlier) and the unread badge from
 * GET /notifications/unread-count. Marking read goes through the same endpoints as the Medicines page.
 */
export function useNotifications() {
  const count = useAsync(() => api<{ count: number }>("/notifications/unread-count"), []);
  const list = useAsync(() => api<Page<AppNotification>>("/notifications?limit=20"), []);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    await Promise.all([count.reload(), list.reload()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(call: () => Promise<unknown>) {
    setActionError(null);
    try {
      await call();
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  return {
    unread: count.data?.count ?? 0,
    items: list.data?.items ?? [],
    loading: list.loading && !list.data,
    error: list.error ? errorMessage(list.error) : null,
    actionError,
    reload,
    markRead: (id: string) => run(() => api(`/notifications/${id}/read`, { method: "POST" })),
    markAllRead: () => run(() => api("/notifications/read-all", { method: "POST" })),
  };
}
