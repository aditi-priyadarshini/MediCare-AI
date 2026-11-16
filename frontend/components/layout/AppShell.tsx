"use client";

import { Apple, FileText, FlaskConical, HeartPulse, Home, LogOut, MapPin, MessageSquare, Pill, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/brand";
import { DisplayToggles } from "@/components/layout/DisplayToggles";
import { VoiceCommandBar } from "@/components/voice/VoiceCommandBar";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { Tr, useT, type MessageKey } from "@/lib/i18n";

const NAV: Array<{ href: string; label: MessageKey; icon: typeof Home }> = [
  { href: "/dashboard", label: "nav.overview", icon: Home },
  { href: "/profile", label: "nav.health", icon: HeartPulse },
  { href: "/records", label: "nav.records", icon: FileText },
  { href: "/labs", label: "nav.labs", icon: FlaskConical },
  { href: "/medications", label: "nav.medicines", icon: Pill },
  { href: "/safety", label: "nav.safety", icon: ShieldAlert },
  { href: "/care", label: "nav.care", icon: MapPin },
  { href: "/diet", label: "nav.diet", icon: Apple },
  { href: "/assistant", label: "nav.assistant", icon: MessageSquare },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { t, language } = useT();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        <Tr k="nav.skip" />
      </a>

      <aside className="hidden bg-brand-900 p-5 text-white lg:flex lg:flex-col">
        <Logo light />
        <nav aria-label={t("nav.main")} className="mt-8 space-y-1">
          <p className="px-3 pb-1 text-xs uppercase tracking-wide text-white/60">
            <Tr k="nav.overview" />
          </p>
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={cn(
                "flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium",
                pathname === href ? "bg-white/15" : "hover:bg-white/10",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <Tr k={label} />
            </Link>
          ))}
        </nav>
        <p className="mt-auto flex items-start gap-2 text-xs text-white/70">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <Tr k="nav.privateNote" />
        </p>
      </aside>

      <div className="flex min-w-0 flex-col pb-16 lg:pb-0">
        <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-4 sm:px-6">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm sm:gap-3">
            <DisplayToggles />
            <VoiceCommandBar />
            <span className="hidden text-ink-soft sm:inline">{user?.display_name ?? user?.email}</span>
            <button
              onClick={() => void logout().then(() => router.replace("/login"))}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-line px-3 font-medium hover:bg-mint-100"
            >
              <LogOut className="h-4 w-4" aria-hidden /> <Tr k="nav.signOut" />
            </button>
          </div>
        </header>
        {language !== "en" && (
          <p role="note" className="border-b border-line bg-info-100 px-4 py-2 text-xs text-ink sm:px-6">
            <Tr k="locale.notice" />
          </p>
        )}
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      <nav
        aria-label={t("nav.main")}
        className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-line bg-surface lg:hidden"
      >
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={cn(
              "flex min-h-[56px] min-w-[72px] flex-1 flex-col items-center justify-center gap-0.5 break-words px-1 text-center text-[0.68rem] font-medium leading-tight",
              pathname === href ? "text-teal-700" : "text-ink-soft",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <Tr k={label} />
          </Link>
        ))}
      </nav>
    </div>
  );
}
