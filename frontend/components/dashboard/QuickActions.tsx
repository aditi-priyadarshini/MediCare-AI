"use client";

import { FlaskConical, MapPin, MessageSquare, Pill, Upload, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useT, type MessageKey } from "@/lib/i18n";

const ACTIONS: Array<{ href: string; icon: LucideIcon; label: MessageKey }> = [
  { href: "/records", icon: Upload, label: "dash.qa.upload" },
  { href: "/medications", icon: Pill, label: "dash.qa.addMed" },
  { href: "/labs", icon: FlaskConical, label: "dash.qa.labs" },
  { href: "/assistant", icon: MessageSquare, label: "dash.qa.ask" },
  { href: "/profile", icon: UserRound, label: "dash.qa.profile" },
  { href: "/care", icon: MapPin, label: "dash.qa.care" },
];

/** Plain links to real pages. Emergency is not repeated here; it stays in the top bar. */
export function QuickActions() {
  const { t } = useT();
  return (
    <section aria-labelledby="qa-heading" data-widget="quick-actions">
      <h2 id="qa-heading" className="mb-3 text-h3 font-semibold text-navy-900">
        {t("dash.qa.title")}
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {ACTIONS.map(({ href, icon: Icon, label }) => (
          <li key={href + label}>
            <Link
              href={href}
              className="flex min-h-[72px] flex-col items-start justify-between gap-2 rounded-card border border-line bg-surface p-3 text-sm font-semibold text-ink shadow-sm hover:bg-mint-100"
            >
              <Icon className="h-5 w-5 text-teal-700" aria-hidden />
              {t(label)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
