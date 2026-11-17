"use client";

import { useState } from "react";
import { CompletionTile } from "@/components/dashboard/DashboardSections";
import { AllergiesSection, ConditionsSection, ContactsSection } from "@/components/health/sections";
import { ProfileNav, type ProfileSectionLink } from "@/components/health/ProfileNav";
import { ProfileSection } from "@/components/health/ProfileSection";
import { BodyForm, IdentityForm, PreferencesForm } from "@/components/health/ProfileForms";
import { Alert, CheckboxField, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";
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
    <div>
      <p className="mb-4 text-sm text-ink-soft">
        Every change is recorded. Withdrawing a required consent will return you to the setup steps.
      </p>
      {error && <Alert tone="danger">{error}</Alert>}
      {consents.error && !consents.data ? (
        <ErrorState title="Couldn’t load your consents" onRetry={() => void consents.reload()}>{errorMessage(consents.error)}</ErrorState>
      ) : consents.loading && !consents.data ? (
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
    </div>
  );
}

const SECTIONS: ProfileSectionLink[] = [
  { id: "personal", label: "prof.sec.personal" },
  { id: "body", label: "prof.sec.body" },
  { id: "conditions", label: "prof.sec.conditions" },
  { id: "allergies", label: "prof.sec.allergies" },
  { id: "contacts", label: "prof.sec.contacts" },
  { id: "preferences", label: "prof.sec.preferences" },
  { id: "privacy", label: "prof.sec.privacy" },
];

export default function ProfilePage() {
  const { t } = useT();
  const { reload } = useProfile();
  // Bumped when a section changes something the completeness tile depends on.
  const [contactsVersion, setContactsVersion] = useState(0);
  const title = (id: string) => t(SECTIONS.find((s) => s.id === id)!.label);

  return (
    <div>
      <PageHeader title={t("prof.title")} description={t("prof.desc")} />
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <ProfileNav sections={SECTIONS} />
        <div className="min-w-0 space-y-4">
          <div className="max-w-xl">
            <CompletionTile refreshKey={contactsVersion} />
          </div>
          <ProfileSection id="personal" title={title("personal")} defaultOpen>
            <IdentityForm />
          </ProfileSection>
          <ProfileSection id="body" title={title("body")}>
            <BodyForm />
          </ProfileSection>
          <ProfileSection id="conditions" title={title("conditions")}>
            <ConditionsSection />
          </ProfileSection>
          <ProfileSection id="allergies" title={title("allergies")}>
            <AllergiesSection />
          </ProfileSection>
          <ProfileSection id="contacts" title={title("contacts")}>
            <ContactsSection onChange={() => {
              setContactsVersion((v) => v + 1);
              void reload();
            }} />
          </ProfileSection>
          <ProfileSection id="preferences" title={title("preferences")}>
            <PreferencesForm />
          </ProfileSection>
          <ProfileSection id="privacy" title={title("privacy")}>
            <ConsentCard />
          </ProfileSection>
        </div>
      </div>
    </div>
  );
}
