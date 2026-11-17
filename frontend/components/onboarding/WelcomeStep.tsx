"use client";

import { Check, Lock, ShieldAlert } from "lucide-react";
import { useT, type MessageKey } from "@/lib/i18n";

const DOES: MessageKey[] = ["ob.welcome.does1", "ob.welcome.does2", "ob.welcome.does3"];

/** Informational only: what the app does and does not do. No data is collected or sent here. */
export function WelcomeStep() {
  const { t } = useT();
  return (
    <>
      <p className="text-base text-ink">{t("ob.welcome.lead")}</p>
      <section aria-labelledby="ob-does">
        <h2 id="ob-does" className="mb-2 font-semibold text-navy-900">
          {t("ob.welcome.doesTitle")}
        </h2>
        <ul className="space-y-2 text-sm text-ink">
          {DOES.map((k) => (
            <li key={k} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden />
              <span>{t(k)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="ob-not" className="rounded-lg border border-line bg-canvas p-3">
        <h2 id="ob-not" className="mb-1 flex items-center gap-2 font-semibold text-navy-900">
          <ShieldAlert className="h-4 w-4 text-ink-soft" aria-hidden /> {t("ob.welcome.notTitle")}
        </h2>
        <p className="text-sm text-ink">{t("ob.welcome.not")}</p>
      </section>
      <p className="flex items-start gap-2 text-sm text-ink-soft">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{t("ob.welcome.privacy")}</span>
      </p>
      <p className="text-sm text-ink-soft">{t("ob.welcome.time")}</p>
    </>
  );
}
