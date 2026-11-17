"use client";

import { usePathname } from "next/navigation";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/lib/auth-context";
import { Tr, useT } from "@/lib/i18n";

/**
 * Frame for every signed-in page: sidebar (desktop), top bar, mobile bar and drawer, and the content
 * area. Navigation comes from lib/nav.ts. Emergency lives in the top bar and is never part of a
 * transition. The page fade is short, keeps content readable from the first frame, and is removed
 * by reduced motion (the --motion-* variables go to ~0).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const { language } = useT();
  const isAdmin = user?.role === "admin";

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-toast focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        <Tr k="nav.skip" />
      </a>

      <Sidebar isAdmin={isAdmin} />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Topbar />
        {language !== "en" && (
          <p role="note" className="border-b border-line bg-info-100 px-4 py-2 text-xs text-ink sm:px-6">
            <Tr k="locale.notice" />
          </p>
        )}
        <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 p-4 sm:p-6 lg:p-8">
          <div key={pathname} className="route-enter">
            {children}
          </div>
        </main>
      </div>

      <MobileNavigation isAdmin={isAdmin} />
    </div>
  );
}
