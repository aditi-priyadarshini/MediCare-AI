"use client";

import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { activeContext } from "@/lib/assistant";
import { useT } from "@/lib/i18n";
import type { AssistantContext } from "@/lib/types";

/**
 * "Using: Medicines, Labs". Built only from the context the server last returned for this chat,
 * so a switch that was refused can never appear here. Announced politely when it changes.
 */
export function ContextChips({ context }: { context: AssistantContext }) {
  const { t } = useT();
  const on = activeContext(context);
  const text = on.length
    ? t("assistant.using", { list: on.map((o) => t(o.chipKey)).join(", ") })
    : t("assistant.usingNone");
  const Icon = on.length ? Eye : EyeOff;
  return (
    <p
      data-testid="context-chips"
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        on.length ? "bg-lavender-100 text-lavender-700" : "bg-mint-100 text-teal-700",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {text}
    </p>
  );
}
