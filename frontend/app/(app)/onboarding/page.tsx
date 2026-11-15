"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand";
import { AllergiesSection, ConditionsSection, ContactsSection } from "@/components/health/sections";
import { PersonalFields, PreferenceFields, profileProblems, type Draft } from "@/components/health/ProfileFields";
import { Alert, Button, Card, CheckboxField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { toInput, useProfile } from "@/lib/profile-context";
import type { ConsentType } from "@/lib/types";

const STEPS = ["Basics", "Language & access", "Conditions & allergies", "Emergency contact", "Privacy"] as const;

export default function OnboardingPage() {
  const { profile, save, reload } = useProfile();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(toInput(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState({ terms: false, privacy: false, health: false, ai: false });

  async function saveProfileAndNext() {
    const problems = profileProblems(draft);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    setError(null);
    try {
      await save(draft);
      setStep((s) => s + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!(consent.terms && consent.privacy && consent.health)) {
      setError("Please accept the three required items to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const put = (t: ConsentType, granted: boolean) =>
        api(`/consents/${t}`, { method: "PUT", body: { granted } });
      await put("terms_of_service", true);
      await put("privacy_policy", true);
      await put("health_data_processing", true);
      if (consent.ai) await put("ai_context", true);
      await reload(); // onboarding_completed flips; the gate then moves us to the dashboard
      router.replace("/dashboard");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const skippable = step === 2 || step === 3;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Logo />
        <p className="text-sm text-ink-soft">Step {step + 1} of {STEPS.length}</p>
      </div>
      <div
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={step + 1}
        aria-valuetext={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
        className="mb-6 flex gap-1.5"
      >
        {STEPS.map((s, i) => (
          <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-teal-700" : "bg-line"}`} />
        ))}
      </div>

      <Card>
        <h1 className="text-xl font-semibold text-navy-900">{STEPS[step]}</h1>
        {error && <Alert tone="danger" className="mt-4">{error}</Alert>}

        <div className="mt-5 space-y-5">
          {step === 0 && (
            <>
              <p className="text-sm text-ink-soft">Only your name is required. Add the rest now or later.</p>
              <PersonalFields draft={draft} setDraft={setDraft} errors={errors} />
            </>
          )}
          {step === 1 && <PreferenceFields draft={draft} setDraft={setDraft} />}
          {step === 2 && (
            <>
              <p className="text-sm text-ink-soft">Optional. Add what you know; you can update it any time.</p>
              <h2 className="font-semibold text-navy-900">Conditions</h2>
              <ConditionsSection />
              <h2 className="pt-2 font-semibold text-navy-900">Allergies</h2>
              <AllergiesSection />
            </>
          )}
          {step === 3 && (
            <>
              <p className="text-sm text-ink-soft">Optional. Someone we can show on your emergency summary.</p>
              <ContactsSection />
            </>
          )}
          {step === 4 && (
            <>
              <p className="text-sm text-ink-soft">
                Your records are private by default and only visible to you. Nothing is shared with doctors,
                caregivers or AI unless you choose to.
              </p>
              <CheckboxField label="I accept the terms of service" checked={consent.terms} onChange={(e) => setConsent((c) => ({ ...c, terms: e.target.checked }))} />
              <CheckboxField label="I’ve read the privacy policy" checked={consent.privacy} onChange={(e) => setConsent((c) => ({ ...c, privacy: e.target.checked }))} />
              <CheckboxField label="Store my health information on this account" description="Needed to keep your profile, conditions and allergies." checked={consent.health} onChange={(e) => setConsent((c) => ({ ...c, health: e.target.checked }))} />
              <div className="border-t border-line pt-4">
                <CheckboxField label="Optional: let the AI assistant use my records" description="The assistant isn’t available yet. This only records your preference and can be changed any time." checked={consent.ai} onChange={(e) => setConsent((c) => ({ ...c, ai: e.target.checked }))} />
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Button variant="ghost" disabled={step === 0 || busy} onClick={() => { setError(null); setStep((s) => s - 1); }}>
            Back
          </Button>
          <div className="flex gap-2">
            {skippable && <Button variant="secondary" onClick={() => setStep((s) => s + 1)}>Skip for now</Button>}
            {step < 2 && <Button loading={busy} onClick={() => void saveProfileAndNext()}>Continue</Button>}
            {(step === 2 || step === 3) && <Button onClick={() => setStep((s) => s + 1)}>Continue</Button>}
            {step === 4 && <Button loading={busy} onClick={() => void finish()}>Finish setup</Button>}
          </div>
        </div>
      </Card>
    </main>
  );
}
