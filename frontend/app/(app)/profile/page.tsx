"use client";

import Link from "next/link";
import { useState } from "react";
import { CompletionTile } from "@/components/dashboard/DashboardSections";
import { AllergiesSection, ConditionsSection, ContactsSection } from "@/components/health/sections";
import { ProfileNav, type ProfileSectionLink } from "@/components/health/ProfileNav";
import { ProfileSection } from "@/components/health/ProfileSection";
import { BodyForm, IdentityForm, PreferencesForm } from "@/components/health/ProfileForms";
import { PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";

const SECTIONS: ProfileSectionLink[] = [
  { id: "personal", label: "prof.sec.personal" },
  { id: "body", label: "prof.sec.body" },
  { id: "conditions", label: "prof.sec.conditions" },
  { id: "allergies", label: "prof.sec.allergies" },
  { id: "contacts", label: "prof.sec.contacts" },
  { id: "preferences", label: "prof.sec.preferences" },
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
            <p className="mt-4 text-sm text-ink-soft">
              Privacy and consent choices are in{" "}
              <Link href="/settings#privacy" className="font-medium text-teal-700 underline">
                Settings
              </Link>
              .
            </p>
          </ProfileSection>
        </div>
      </div>
    </div>
  );
}
