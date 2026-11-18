"use client";

import { useState } from "react";
import { Alert, Card, CheckboxField, Skeleton } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import type { Consent } from "@/lib/types";

const CONSENT_COPY: Record<string, { label: string; description: string }> = {
  terms_of_service: { label: "Terms of service", description: "Required to use MediCare AI." },
  privacy_policy: { label: "Privacy policy", description: "Required. Explains how your data is handled." },
  health_data_processing: {
    label: "Store my health information",
    description: "Required to keep your profile, conditions and allergies on your record.",
  },
  ai_context: {
    label: "Let the AI assistant use my records",
    description: "Lets the assistant read only the kinds of record you switch on in each chat. Off by default; you can turn it off any time.",
  },
  reminder_email: {
    label: "Email me when a reminder is due",
    description:
      "One short email that says you have a reminder. It never includes medicine names. You can turn this off any time.",
  },
  reminder_call: {
    label: "Ring my phone when a dose is due",
    description:
      "The MediCare AI phone app rings like an incoming call and reads the reminder once you answer. The ring itself never shows a medicine name. A call never marks a dose as taken; you do that in the app. You can turn this off any time.",
  },
};

/** Privacy and consent switches. Lives in Settings; every change is recorded by the server. */
export function ConsentCard() {
  const consents = useAsync(() => api<Consent[]>("/consents"), []);
  const [error, setError] = useState<string | null>(null);

  async function toggle(c: Consent, granted: boolean) {
    setError(null);
    try {
      await api(`/consents/${c.consent_type}`, { method: "PUT", body: { granted } });
      await consents.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card id="privacy" aria-labelledby="privacy-h" className="scroll-mt-24">
      <h2 id="privacy-h" className="mb-1 text-h3 text-navy-900">Privacy and consent</h2>
      <p className="mb-4 text-sm text-ink-soft">
        Every change is recorded. Withdrawing a required consent will return you to the setup steps.
      </p>
      {error && <Alert tone="danger">{error}</Alert>}
      {consents.loading && !consents.data ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="space-y-4">
          {consents.data?.map((c) => (
            <CheckboxField
              key={c.consent_type}
              label={CONSENT_COPY[c.consent_type]?.label ?? c.consent_type}
              description={CONSENT_COPY[c.consent_type]?.description}
              checked={c.granted}
              onChange={(e) => void toggle(c, e.target.checked)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
