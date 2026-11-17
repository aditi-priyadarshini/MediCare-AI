"use client";

import { Bell, CheckCheck } from "lucide-react";
import { Button, Skeleton } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/Popover";
import { useT } from "@/lib/i18n";
import { useNotifications } from "@/lib/notifications";
import { useProfile } from "@/lib/profile-context";

/** Bell with an unread count and a list of real reminders. Nothing here is invented. */
export function NotificationPanel() {
  const { t } = useT();
  const { profile } = useProfile();
  const n = useNotifications();
  const label = n.unread > 0 ? t("notif.openUnread", { count: n.unread }) : t("notif.open");

  return (
    <Popover
      label={label}
      panelLabel={t("notif.title")}
      onOpenChange={(open) => open && void n.reload()}
      trigger={
        <>
          <Bell className="h-5 w-5" aria-hidden />
          {n.unread > 0 && (
            <span aria-hidden className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-700 px-1 text-xs font-semibold text-white">
              {n.unread > 9 ? "9+" : n.unread}
            </span>
          )}
        </>
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-h3 text-navy-900">{t("notif.title")}</h2>
        {n.unread > 0 && (
          <Button variant="ghost" onClick={() => void n.markAllRead()}>
            <CheckCheck className="h-4 w-4" aria-hidden /> {t("notif.markAll")}
          </Button>
        )}
      </div>

      {n.actionError && (
        <p role="alert" className="mb-2 text-sm font-medium text-danger-700">
          {t("notif.markFailed")}
        </p>
      )}

      {n.loading ? (
        <div role="status" aria-label={t("notif.loading")} className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : n.error ? (
        <div role="alert" className="space-y-2 text-sm">
          <p className="text-danger-700">{t("notif.error")}</p>
          <Button variant="secondary" onClick={() => void n.reload()}>
            {t("notif.retry")}
          </Button>
        </div>
      ) : n.items.length === 0 ? (
        <p className="py-4 text-sm text-ink-soft">{t("notif.empty")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {n.items.map((it) => {
            const unread = it.read_at === null;
            return (
              <li key={it.id} className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className={unread ? "text-sm font-semibold text-ink" : "text-sm text-ink-soft"}>{it.title}</p>
                  <p className="text-sm text-ink-soft">{it.body}</p>
                  <p className="tnum mt-1 text-xs text-ink-soft">
                    {new Date(it.due_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: profile.timezone })}
                  </p>
                </div>
                {unread && (
                  <Button variant="ghost" onClick={() => void n.markRead(it.id)} aria-label={t("notif.markReadNamed", { title: it.title })}>
                    {t("notif.markRead")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Popover>
  );
}
