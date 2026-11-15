"use client";

import { Contrast, ALargeSmall } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { toInput, useProfile } from "@/lib/profile-context";
import type { AccessibilityPrefs } from "@/lib/types";

/** One-tap text size and contrast switches in the header; they save to the patient's profile. */
export function DisplayToggles() {
  const { t } = useT();
  const { profile, save } = useProfile();
  const [failed, setFailed] = useState(false);
  const prefs = profile.accessibility_preferences;

  async function toggle(key: "large_text" | "high_contrast") {
    setFailed(false);
    const next: AccessibilityPrefs = { ...prefs, [key]: !prefs[key] };
    try {
      await save({ ...toInput(profile), accessibility_preferences: next });
    } catch {
      setFailed(true);
    }
  }

  const btn = (on: boolean) =>
    cn(
      "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg border border-line px-2 text-sm font-medium hover:bg-mint-100 sm:px-3",
      on && "bg-mint-100 text-teal-700",
    );

  return (
    <div role="group" aria-label={t("a11y.quick")} className="flex items-center gap-1">
      <button type="button" aria-pressed={prefs.large_text} onClick={() => void toggle("large_text")} className={btn(prefs.large_text)}>
        <ALargeSmall className="h-5 w-5" aria-hidden />
        <span className="sr-only lg:not-sr-only">{t("a11y.quick.largeText")}</span>
      </button>
      <button type="button" aria-pressed={prefs.high_contrast} onClick={() => void toggle("high_contrast")} className={btn(prefs.high_contrast)}>
        <Contrast className="h-5 w-5" aria-hidden />
        <span className="sr-only lg:not-sr-only">{t("a11y.quick.contrast")}</span>
      </button>
      {failed && (
        <span role="alert" className="text-xs text-danger-700">
          {t("a11y.quick.failed")}
        </span>
      )}
    </div>
  );
}
