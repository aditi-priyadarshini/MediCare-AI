"use client";

import { Siren } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ExperienceMenu } from "@/components/layout/ExperienceMenu";
import { NotificationPanel } from "@/components/layout/NotificationPanel";
import { SearchCommand } from "@/components/layout/SearchCommand";
import { UserMenu } from "@/components/layout/UserMenu";
import { VoiceCommandBar } from "@/components/voice/VoiceCommandBar";
import { useT } from "@/lib/i18n";

/**
 * Sticky top bar. Emergency is a plain link, always visible at every width, never inside a menu and
 * never animated. On phones the experience menu, voice and account live in the "More" drawer to
 * keep the bar usable at 320px.
 */
export function Topbar() {
  const { t } = useT();
  return (
    <header className="sticky top-0 z-nav flex min-h-16 items-center gap-2 border-b border-line bg-surface px-3 sm:gap-3 sm:px-6">
      <div className="lg:hidden">
        <Logo compact />
      </div>
      <div className="hidden min-w-0 flex-1 md:block">
        <Breadcrumbs />
      </div>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <SearchCommand />
        <Link
          href="/emergency"
          className="inline-flex min-h-control items-center gap-1.5 rounded-lg bg-danger-700 px-3 text-sm font-semibold text-white hover:opacity-90"
        >
          <Siren className="h-4 w-4" aria-hidden /> {t("nav.emergency")}
        </Link>
        <NotificationPanel />
        <div className="hidden items-center gap-2 sm:flex">
          <ExperienceMenu />
          <VoiceCommandBar />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
