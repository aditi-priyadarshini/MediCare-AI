"use client";

import { useState } from "react";
import { AllergiesSection, ConditionsSection, ContactsSection } from "@/components/health/sections";
import { PersonalFields, PreferenceFields, profileProblems, type Draft } from "@/components/health/ProfileFields";
import { Alert, Button, Card, CheckboxField, Skeleton, VerificationBadge } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { toInput, useProfile } from "@/lib/profile-context";
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
};

function PersonalCard() {
  const { profile, save } = useProfile();
  const [draft, setDraft] = useState<Draft>(toInput(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problems = profileProblems(draft);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setState("saving");
    try {
      await save(draft);
      setState("saved");
    } catch (err) {
      setState(errorMessage(err));
    }
  }

  const failed = state !== "idle" && state !== "saving" && state !== "saved";
  return (
    <Card aria-labelledby="personal">
      <h2 id="personal" className="mb-4 font-semibold text-navy-900">Personal details</h2>
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <PersonalFields draft={draft} setDraft={setDraft} errors={errors} />
        {profile.blood_group && (
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            Saved blood group: <strong className="text-ink">{profile.blood_group}</strong>
            <VerificationBadge status={profile.blood_group_verification_status} />
          </p>
        )}
        <div className="border-t border-line pt-5">
          <PreferenceFields draft={draft} setDraft={setDraft} />
        </div>
        {failed && <Alert tone="danger" title="Couldn’t save">{state}</Alert>}
        {state === "saved" && <Alert tone="success" title="Saved">Your profile has been updated.</Alert>}
        <Button type="submit" loading={state === "saving"}>Save changes</Button>
      </form>
    </Card>
  );
}

function ConsentCard() {
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
    <Card aria-labelledby="privacy">
      <h2 id="privacy" className="mb-1 font-semibold text-navy-900">Privacy and consent</h2>
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

export default function ProfilePage() {
  const { reload } = useProfile();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">My Health</h1>
        <p className="mt-1 text-ink-soft">Your profile, conditions, allergies and emergency contacts.</p>
      </div>
      <PersonalCard />
      <Card aria-labelledby="cond"><h2 id="cond" className="mb-3 font-semibold text-navy-900">Conditions</h2><ConditionsSection /></Card>
      <Card aria-labelledby="all"><h2 id="all" className="mb-3 font-semibold text-navy-900">Allergies</h2><AllergiesSection /></Card>
      <Card aria-labelledby="ec"><h2 id="ec" className="mb-3 font-semibold text-navy-900">Emergency contacts</h2><ContactsSection onChange={() => void reload()} /></Card>
      <ConsentCard />
    </div>
  );
}
