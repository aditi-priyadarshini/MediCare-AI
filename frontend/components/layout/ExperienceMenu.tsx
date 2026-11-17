"use client";

import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { ExperienceChoice, PreferenceSwitches } from "@/components/settings/PreferenceControls";
import { Popover } from "@/components/ui/Popover";
import { useT } from "@/lib/i18n";

/** Quick access to reading mode, text size, contrast, motion and voice. Full page: /settings. */
export function ExperienceMenu() {
  const { t } = useT();
  return (
    <Popover label={t("exp.open")} panelLabel={t("exp.title")} trigger={<SlidersHorizontal className="h-5 w-5" aria-hidden />}>
      {({ close }) => (
        <div className="space-y-4">
          <h2 className="text-h3 text-navy-900">{t("exp.title")}</h2>
          <ExperienceChoice />
          <PreferenceSwitches compact />
          <Link href="/settings" onClick={() => close(false)} className="inline-flex min-h-control items-center text-sm font-medium text-teal-700 underline">
            {t("exp.allSettings")}
          </Link>
        </div>
      )}
    </Popover>
  );
}
