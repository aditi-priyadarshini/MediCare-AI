"use client";

import Link from "next/link";
import { ConsentCard } from "@/components/settings/ConsentCard";
import { ExperienceChoice, PreferenceSwitches } from "@/components/settings/PreferenceControls";
import { Card, SelectField } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/PageHeader";
import { useT, type MessageKey } from "@/lib/i18n";
import { usePreferences } from "@/lib/preferences";
import type { Language } from "@/lib/types";

const LANGUAGES: Language[] = ["en", "hi", "or"];

/** Every control here saves a real profile field straight away (reading mode is device-only). */
export default function SettingsPage() {
  const { t } = useT();
  const { language, setLanguage, failed, saving } = usePreferences();

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} description={t("settings.desc")} />

      <Card aria-labelledby="set-lang" className="space-y-3">
        <h2 id="set-lang" className="text-h3 text-navy-900">{t("settings.language.title")}</h2>
        <SelectField
          label={t("a11y.language")}
          value={language}
          disabled={saving}
          onChange={(e) => void setLanguage(e.target.value as Language)}
          options={LANGUAGES.map((l) => ({ value: l, label: t(`lang.${l}` as MessageKey) }))}
          hint={t("a11y.language.hint")}
        />
        {failed && <p role="alert" className="text-sm font-medium text-danger-700">{t("a11y.quick.failed")}</p>}
      </Card>

      <Card aria-labelledby="set-display" className="space-y-4">
        <div>
          <h2 id="set-display" className="text-h3 text-navy-900">{t("settings.display.title")}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t("settings.display.desc")}</p>
        </div>
        <ExperienceChoice />
        <PreferenceSwitches only={["large_text", "high_contrast", "reduce_motion"]} />
      </Card>

      <ConsentCard />

      <Card aria-labelledby="set-voice" className="space-y-3">
        <h2 id="set-voice" className="text-h3 text-navy-900">{t("settings.voice.title")}</h2>
        <PreferenceSwitches only={["voice_enabled"]} />
      </Card>

      <Card aria-labelledby="set-more" className="space-y-2">
        <h2 id="set-more" className="text-h3 text-navy-900">{t("settings.links.title")}</h2>
        <p className="text-sm text-ink-soft">{t("settings.links.profileDesc")}</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/profile" className="inline-flex min-h-control items-center text-sm font-medium text-teal-700 underline">{t("settings.links.profile")}</Link>
          <Link href="/feedback" className="inline-flex min-h-control items-center text-sm font-medium text-teal-700 underline">{t("settings.links.feedback")}</Link>
        </div>
      </Card>
    </div>
  );
}
