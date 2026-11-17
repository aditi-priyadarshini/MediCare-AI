"use client";

import { Database, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { modeBadge, MODE_NOTE_KEY } from "@/lib/assistant";
import { useT } from "@/lib/i18n";
import type { ChatMessage } from "@/lib/types";

/**
 * Which kind of answer this is, from what the API returned for this message. Lavender (AI) is only
 * used when a model really wrote the text; plain record listings are neutral or amber.
 */
export function AnswerModeBadge({ message }: { message: Pick<ChatMessage, "mode" | "evidence"> }) {
  const { t } = useT();
  const badge = modeBadge(message);
  if (!badge || !message.mode) return null;
  return (
    <div className="mt-2 space-y-1">
      <StatusBadge tone={badge.tone} icon={badge.tone === "ai" ? Sparkles : Database}>
        {t(badge.key)}
      </StatusBadge>
      <p className="text-xs text-ink-soft">{t(MODE_NOTE_KEY[message.mode])}</p>
    </div>
  );
}
