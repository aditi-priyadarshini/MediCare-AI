"use client";

import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import type { AccessibilityPrefs } from "@/lib/types";

/**
 * Shows the draft choices before they are saved: text size, contrast and motion. The same facts are
 * written out in words so nothing depends on seeing the sample.
 */
export function AccessPreview({ prefs }: { prefs: AccessibilityPrefs }) {
  const { t } = useT();
  return (
    <section aria-labelledby="ob-preview" className="space-y-2">
      <h2 id="ob-preview" className="text-sm font-medium text-ink">
        {t("ob.access.preview")}
      </h2>
      <div
        data-testid="access-preview"
        className={cn(
          "rounded-card border p-4",
          prefs.high_contrast ? "border-2 border-black bg-white text-black" : "border-line bg-canvas text-ink",
          prefs.large_text ? "text-xl" : "text-base",
        )}
      >
        <p className="font-semibold">{t("ob.access.sampleTitle")}</p>
        <p className="mt-1">{t("ob.access.sampleBody")}</p>
        <span
          className={cn(
            "mt-3 inline-flex min-h-control items-center rounded-lg px-4 font-semibold",
            prefs.high_contrast ? "bg-black text-white" : "bg-teal-700 text-white",
          )}
        >
          {t("ob.access.sampleButton")}
        </span>
      </div>
      <ul className="text-sm text-ink-soft">
        <li>{t(prefs.large_text ? "ob.access.sizeLarge" : "ob.access.sizeNormal")}</li>
        <li>{t(prefs.high_contrast ? "ob.access.contrastHigh" : "ob.access.contrastNormal")}</li>
        <li>{t(prefs.reduce_motion ? "ob.access.motionOn" : "ob.access.motionOff")}</li>
      </ul>
    </section>
  );
}
