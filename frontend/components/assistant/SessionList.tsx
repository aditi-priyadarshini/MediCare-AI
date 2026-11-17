"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useT } from "@/lib/i18n";
import type { ChatSessionBrief } from "@/lib/types";

interface Props {
  sessions: ChatSessionBrief[];
  activeId: string | null;
  busy: boolean;
  creating: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
}

export function SessionList({ sessions, activeId, busy, creating, onOpen, onNew }: Props) {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <Button onClick={onNew} loading={creating} disabled={busy} fullWidth>
        {!creating && <Plus className="h-4 w-4" aria-hidden />} {t("assistant.newChat")}
      </Button>
      {sessions.length === 0 ? (
        <p className="text-sm text-ink-soft">{t("assistant.chats.none")}</p>
      ) : (
        <ul className="space-y-1">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onOpen(s.id)}
                aria-current={activeId === s.id ? "true" : undefined}
                className="min-h-[44px] w-full truncate rounded-lg px-3 text-left text-sm text-ink hover:bg-mint-100 disabled:opacity-60 aria-[current=true]:bg-mint-100 aria-[current=true]:font-semibold"
              >
                {s.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
