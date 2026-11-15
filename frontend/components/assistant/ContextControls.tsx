"use client";

import Link from "next/link";
import { Alert, CheckboxField } from "@/components/ui/primitives";
import { CONTEXT_OPTIONS } from "@/lib/assistant";
import type { AssistantContext, ContextKey } from "@/lib/types";

interface Props {
  context: AssistantContext;
  consentGranted: boolean;
  busy: boolean;
  onChange: (key: ContextKey, value: boolean) => void;
}

export function ContextControls({ context, consentGranted, busy, onChange }: Props) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-ink">Records the assistant may use in this chat</legend>
      {!consentGranted && (
        <Alert tone="info" title="Your records are off-limits for now">
          Allow the assistant to use your records in{" "}
          <Link href="/profile" className="font-medium underline">
            My Health
          </Link>{" "}
          to switch any of these on. Until then it can only use general medicine reference notes.
        </Alert>
      )}
      {CONTEXT_OPTIONS.map((o) => (
        <CheckboxField
          key={o.key}
          label={o.label}
          description={o.hint}
          checked={context[o.key]}
          // Switching a kind OFF is always allowed; switching it ON needs consent.
          disabled={busy || (!consentGranted && !context[o.key])}
          onChange={(e) => onChange(o.key, e.target.checked)}
        />
      ))}
    </fieldset>
  );
}
