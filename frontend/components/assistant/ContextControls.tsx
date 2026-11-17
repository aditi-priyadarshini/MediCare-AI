"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { Alert, CheckboxField } from "@/components/ui/primitives";
import { activeContext, CONTEXT_OPTIONS } from "@/lib/assistant";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import type { AssistantContext, ContextKey } from "@/lib/types";

interface ControlsProps {
  context: AssistantContext;
  consentGranted: boolean;
  /** A switch change is being saved: shows "Saving…" and locks the switches. */
  busy: boolean;
  /** Something else is in flight (an answer): locks the switches without the "Saving…" text. */
  locked?: boolean;
  onChange: (key: ContextKey, value: boolean) => void;
  /** Easy-read: larger text. Still one group of switches. */
  easy?: boolean;
}

/**
 * The five switches. State shown is always what the server returned: a switch only changes after
 * the API accepted it. Without the ai_context consent nothing can be switched ON (the API would
 * refuse), so those are disabled with the reason and a path to the consent setting. Switching OFF
 * is always allowed.
 */
export function ContextControls({ context, consentGranted, busy, locked, onChange, easy }: ControlsProps) {
  const { t } = useT();
  return (
    <fieldset className="space-y-3 rounded-lg border border-line p-4" aria-busy={busy || undefined}>
      <legend className={cn("px-1 font-semibold text-ink", easy ? "text-base" : "text-sm")}>{t("assistant.ctx.title")}</legend>
      {!consentGranted && (
        <Alert tone="info" title={t("assistant.ctx.consentTitle")}>
          <p>{t("assistant.ctx.consentBody")}</p>
          <Link href="/profile#privacy" className="mt-1 inline-flex min-h-[44px] items-center font-medium underline">
            {t("assistant.ctx.consentLink")}
          </Link>
        </Alert>
      )}
      <div className={cn("space-y-3", easy && "[&_label]:text-base")}>
        {CONTEXT_OPTIONS.map((o) => (
          <CheckboxField
            key={o.key}
            label={t(o.labelKey)}
            description={t(o.hintKey)}
            checked={context[o.key]}
            disabled={busy || locked || (!consentGranted && !context[o.key])}
            onChange={(e) => onChange(o.key, e.target.checked)}
          />
        ))}
      </div>
      <p role="status" aria-live="polite" className="min-h-[1rem] text-xs text-ink-soft">
        {busy ? t("assistant.ctx.saving") : ""}
      </p>
    </fieldset>
  );
}

/** "What the AI can see": exactly the kinds that are on, and an honest line when none are. */
export function ContextInspector({ context }: { context: AssistantContext }) {
  const { t } = useT();
  const on = activeContext(context);
  return (
    <section aria-labelledby="ctx-inspect" className="rounded-lg bg-lavender-100 p-4 text-lavender-700">
      <h3 id="ctx-inspect" className="flex items-center gap-2 text-sm font-semibold">
        <Eye className="h-4 w-4" aria-hidden />
        {t("assistant.inspect.title")}
      </h3>
      {on.length === 0 ? (
        <p className="mt-2 text-sm">{t("assistant.inspect.none")}</p>
      ) : (
        <>
          <p className="mt-2 text-sm">{t("assistant.inspect.some")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {on.map((o) => (
              <li key={o.key}>{t(o.labelKey)}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">{t("assistant.inspect.note")}</p>
        </>
      )}
    </section>
  );
}

/** The selector plus the inspector: the content of the side panel and of the mobile sheet. */
export function ContextPanel(props: ControlsProps) {
  return (
    <div className="space-y-4">
      <ContextControls {...props} />
      {!props.easy && <ContextInspector context={props.context} />}
    </div>
  );
}
