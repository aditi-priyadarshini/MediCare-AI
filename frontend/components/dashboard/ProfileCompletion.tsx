"use client";

import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { useT, type MessageKey } from "@/lib/i18n";
import type { MissingKey } from "@/lib/dashboard";

const LABEL: Record<MissingKey, MessageKey> = {
  dob: "dash.missing.dob",
  body: "dash.missing.body",
  blood: "dash.missing.blood",
  contact: "dash.missing.contact",
};

const R = 26;
const C = 2 * Math.PI * R;

/**
 * How much of the profile is filled in, as a ring plus the percentage as text. It describes the form,
 * not the person's health, and says so.
 */
export function ProfileCompletion({ percent, missing }: { percent: number; missing: MissingKey[] }) {
  const { t } = useT();
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <Card aria-labelledby="completion-heading" data-widget="completion" className="min-w-0 py-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex items-center gap-4">
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-labelledby="completion-heading"
            className="relative h-14 w-14 shrink-0"
          >
            <svg viewBox="0 0 64 64" className="h-14 w-14 -rotate-90" aria-hidden>
              <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-line" />
              <circle
                cx="32"
                cy="32"
                r={R}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - pct / 100)}
                className="stroke-teal-500 transition-[stroke-dashoffset] duration-slow"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-navy-900 tnum">
              {pct}%
            </span>
          </div>
          <div className="min-w-0">
            <h2 id="completion-heading" className="text-h3 font-semibold text-navy-900">
              {t("dash.complete.title")}
            </h2>
            <p className="mt-0.5 max-w-sm text-xs text-ink-soft">{t("dash.complete.note")}</p>
          </div>
        </div>
        {missing.length > 0 ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <div>
              <p className="text-sm font-medium text-ink">{t("dash.complete.missing")}</p>
              <ul className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                {missing.map((m) => (
                  <li key={m}>{t(LABEL[m])}</li>
                ))}
              </ul>
            </div>
            <Link href="/profile" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-700 underline">
              {t("dash.complete.finish")}
            </Link>
          </div>
        ) : (
          pct >= 100 && <p className="text-sm text-ink-soft">{t("dash.complete.done")}</p>
        )}
      </div>
    </Card>
  );
}
