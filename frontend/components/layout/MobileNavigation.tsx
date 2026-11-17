"use client";

import { LogOut, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ExperienceChoice, PreferenceSwitches } from "@/components/settings/PreferenceControls";
import { Drawer } from "@/components/ui/Drawer";
import { VoiceCommandBar } from "@/components/voice/VoiceCommandBar";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { groupedRoutes, isActive, labelText, MOBILE_PRIMARY } from "@/lib/nav";

/** Phone navigation: four primary pages plus "More", which opens the full grouped list in a drawer. */
export function MobileNavigation({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const item = "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-center text-[0.68rem] font-medium leading-tight";

  return (
    <>
      <nav
        aria-label={t("nav.quick")}
        className="fixed inset-x-0 bottom-0 z-nav flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {MOBILE_PRIMARY.map(({ href, icon: Icon, label, shortLabel }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn(item, active ? "text-teal-700" : "text-ink-soft")}>
              <Icon className="h-5 w-5" aria-hidden />
              <span>{labelText(shortLabel ?? label, t)}</span>
            </Link>
          );
        })}
        <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={cn(item, "text-ink-soft")}>
          <MoreHorizontal className="h-5 w-5" aria-hidden />
          <span>{t("nav.more")}</span>
        </button>
      </nav>

      <Drawer open={open} onClose={() => setOpen(false)} title={t("nav.moreTitle")} closeLabel={t("nav.close")}>
        <nav aria-label={t("nav.moreTitle")} className="space-y-4">
          {groupedRoutes(isAdmin).map((g) => (
            <div key={g.id} role="group" aria-label={labelText(g.label, t)}>
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{labelText(g.label, t)}</p>
              <ul>
                {g.routes.map(({ href, icon: Icon, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={isActive(pathname, href) ? "page" : undefined}
                      className={cn("flex min-h-control items-center gap-3 rounded-lg px-2 text-sm font-medium", isActive(pathname, href) ? "bg-mint-100 text-teal-700" : "text-ink hover:bg-mint-100")}
                    >
                      <Icon className="h-5 w-5" aria-hidden /> {labelText(label, t)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-5 space-y-4 border-t border-line pt-4">
          <ExperienceChoice />
          <PreferenceSwitches compact />
          <VoiceCommandBar />
        </div>

        <button
          type="button"
          onClick={() => void logout().then(() => router.replace("/login"))}
          className="mt-5 inline-flex min-h-control w-full items-center justify-center gap-2 rounded-lg border border-line px-3 text-sm font-medium hover:bg-mint-100"
        >
          <LogOut className="h-4 w-4" aria-hidden /> {t("nav.signOut")}
        </button>
      </Drawer>
    </>
  );
}
