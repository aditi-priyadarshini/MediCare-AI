"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand";
import { AllergiesSection, ConditionsSection, ContactsSection } from "@/components/health/sections";
import { PersonalFields, PreferenceFields, profileProblems, type Draft } from "@/components/health/ProfileFields";
import { AccessPreview } from "@/components/onboarding/AccessPreview";
import { ActionBar, StepPanel, type Direction } from "@/components/onboarding/parts";
import { WelcomeStep } from "@/components/onboarding/WelcomeStep";
import { Alert, Button, Card, CheckboxField } from "@/components/ui/primitives";
import { StepProgress } from "@/components/ui/StepProgress";
import { ExperienceChoice } from "@/components/settings/PreferenceControls";
import { api, errorMessage } from "@/lib/api-client";
import { useT, type MessageKey } from "@/lib/i18n";
import { toInput, useProfile } from "@/lib/profile-context";
import type { ConsentType } from "@/lib/types";

const STEPS = ["welcome", "basics", "access", "health", "contact", "privacy"] as const;
type StepKey = (typeof STEPS)[number];
const NAME: Record<StepKey, MessageKey> = {
  welcome: "ob.step.welcome",
  basics: "ob.step.basics",
  access: "ob.step.access",
  health: "ob.step.health",
  contact: "ob.step.contact",
  privacy: "ob.step.privacy",
};
/** Steps whose answers are saved to the profile when the person continues. */
const SAVES_PROFILE: StepKey[] = ["basics", "access"];
const OPTIONAL: StepKey[] = ["health", "contact"];

export default function OnboardingPage() {
  const { profile, save, reload } = useProfile();
  const { t } = useT();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const direction = useRef<Direction>("forward");
  const [draft, setDraft] = useState<Draft>(toInput(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState({ terms: false, privacy: false, health: false, ai: false });
  const [focusTick, setFocusTick] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const key = STEPS[step]!;
  const names = STEPS.map((s) => t(NAME[s]));

  // Move focus to the step heading when the step changes, so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // After a failed check, put focus on the first field that needs fixing.
  useEffect(() => {
    if (focusTick === 0) return;
    const el = cardRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], input[type="checkbox"][aria-required="true"]:not(:checked)');
    el?.focus();
  }, [focusTick]);

  function go(to: number) {
    direction.current = to > step ? "forward" : "back";
    setError(null);
    setErrors({});
    setStep(to);
    setVisited((v) => new Set(v).add(to));
  }

  async function next() {
    if (SAVES_PROFILE.includes(key)) {
      const problems = profileProblems(draft);
      setErrors(problems);
      if (Object.keys(problems).length) {
        setError(t("ob.error.fields"));
        setFocusTick((n) => n + 1);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await save(draft);
      } catch (e) {
        setError(errorMessage(e));
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    go(step + 1);
  }

  async function finish() {
    if (!(consent.terms && consent.privacy && consent.health)) {
      setError(t("ob.error.consent"));
      setFocusTick((n) => n + 1);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const put = (c: ConsentType, granted: boolean) => api(`/consents/${c}`, { method: "PUT", body: { granted } });
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

  const optional = OPTIONAL.includes(key);
  const last = step === STEPS.length - 1;
  const panel = (k: StepKey) => ({ active: key === k, visited: visited.has(STEPS.indexOf(k)), direction: direction.current });
  const tick = (field: keyof typeof consent) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setConsent((c) => ({ ...c, [field]: e.target.checked }));

  return (
    <main className="mx-auto max-w-2xl px-4 pb-4 pt-6 sm:py-8">
      <div className="mb-4 flex items-center justify-between">
        <Logo />
        <p className="text-sm text-ink-soft tnum">{t("ob.stepOf", { n: step + 1, total: STEPS.length })}</p>
      </div>
      <div className="mb-5">
        <div className="hidden sm:block">
          <StepProgress steps={names} current={step} />
        </div>
        <div
          role="progressbar"
          aria-label={t("ob.stepOf", { n: step + 1, total: STEPS.length })}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          aria-valuetext={`${t("ob.stepOf", { n: step + 1, total: STEPS.length })}: ${names[step]}`}
          className="flex gap-1.5 sm:hidden"
        >
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-teal-700" : "bg-line"}`} />
          ))}
        </div>
      </div>

      <div ref={cardRef}>
        <Card>
          <h1 ref={headingRef} tabIndex={-1} className="text-h1 text-navy-900 outline-none">
            {key === "welcome" ? t("ob.welcome.title") : names[step]}
          </h1>
          {optional && <p className="mt-1 text-sm font-medium text-ink-soft">{t("ob.optional")}</p>}
          {error && (
            <Alert tone="danger" className="mt-4">
              {error}
            </Alert>
          )}

          <div className="mt-5">
            <StepPanel {...panel("welcome")}>
              <WelcomeStep />
            </StepPanel>

            <StepPanel {...panel("basics")}>
              <p className="text-sm text-ink-soft">{t("ob.basics.why")}</p>
              <p className="text-sm font-medium text-ink">{t("ob.basics.required")}</p>
              <PersonalFields draft={draft} setDraft={setDraft} errors={errors} />
            </StepPanel>

            <StepPanel {...panel("access")}>
              <p className="text-sm text-ink-soft">{t("ob.access.why")}</p>
              <PreferenceFields draft={draft} setDraft={setDraft} />
              <ExperienceChoice />
              <AccessPreview prefs={draft.accessibility_preferences} />
            </StepPanel>

            <StepPanel {...panel("health")} keepMounted>
              <p className="text-sm text-ink-soft">{t("ob.health.why")}</p>
              <h2 className="font-semibold text-navy-900">{t("ob.health.conditions")}</h2>
              <ConditionsSection />
              <h2 className="pt-2 font-semibold text-navy-900">{t("ob.health.allergies")}</h2>
              <AllergiesSection />
            </StepPanel>

            <StepPanel {...panel("contact")} keepMounted>
              <p className="text-sm text-ink-soft">{t("ob.contact.why")}</p>
              <ContactsSection />
            </StepPanel>

            <StepPanel {...panel("privacy")}>
              <p className="text-sm text-ink-soft">{t("ob.privacy.why")}</p>
              <p className="text-sm font-medium text-ink">{t("ob.privacy.required")}</p>
              <CheckboxField aria-required="true" label={t("ob.privacy.terms")} checked={consent.terms} onChange={tick("terms")} />
              <CheckboxField aria-required="true" label={t("ob.privacy.policy")} checked={consent.privacy} onChange={tick("privacy")} />
              <CheckboxField aria-required="true" label={t("ob.privacy.health")} description={t("ob.privacy.healthDesc")} checked={consent.health} onChange={tick("health")} />
              <div className="border-t border-line pt-4">
                <CheckboxField label={t("ob.privacy.ai")} description={t("ob.privacy.aiDesc")} checked={consent.ai} onChange={tick("ai")} />
              </div>
            </StepPanel>
          </div>
        </Card>
      </div>

      <ActionBar>
        <Button variant="ghost" disabled={step === 0 || busy} onClick={() => go(step - 1)}>
          {t("ob.back")}
        </Button>
        <div className="flex flex-wrap gap-2">
          {optional && (
            <Button variant="secondary" disabled={busy} onClick={() => go(step + 1)}>
              {t("ob.skip")}
            </Button>
          )}
          {!last ? (
            <Button loading={busy} onClick={() => void next()}>
              {step === 0 ? t("ob.start") : t("ob.continue")}
            </Button>
          ) : (
            <Button loading={busy} onClick={() => void finish()}>
              {t("ob.finish")}
            </Button>
          )}
        </div>
      </ActionBar>
    </main>
  );
}
