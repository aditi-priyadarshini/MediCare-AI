"use client";

import { ChevronsLeft, ChevronsRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { groupedRoutes, isActive, labelText } from "@/lib/nav";

const KEY = "medicare.sidebar";

/** Storage can be blocked (private mode, policy): fall back to expanded, never throw. */
export function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "collapsed";
  } catch {
    return false;
  }
}

/**
 * Desktop navigation: 248px expanded, 76px collapsed. Collapsed icons keep their accessible name
 * (the label becomes screen-reader-only) and show a tooltip on hover and keyboard focus. The tooltip
 * is positioned from the item so it is not clipped by the scrolling list.
 */
export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useT();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [tip, setTip] = useState<{ text: string; top: number } | null>(null);

  useEffect(() => setCollapsed(readCollapsed()), []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    setTip(null);
    try {
      window.localStorage.setItem(KEY, next ? "collapsed" : "expanded");
    } catch {
      /* stays collapsed for this session only */
    }
  }

  const show = (text: string) => (e: React.SyntheticEvent<HTMLElement>) => {
    if (!collapsed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ text, top: r.top + r.height / 2 });
  };

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col bg-brand-900 py-5 text-white transition-[width] duration-base ease-in-out lg:flex",
        collapsed ? "w-[76px] px-3" : "w-[248px] px-4",
      )}
    >
      <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between px-1")}>
        <Logo light compact={collapsed} />
      </div>

      <nav aria-label={t("nav.main")} className="mt-4 flex-1 space-y-2.5 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groupedRoutes(isAdmin).map((group) => (
          <div key={group.id} role="group" aria-label={labelText(group.label, t)}>
            <p className={cn("px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-white/70", collapsed && "sr-only")}>{labelText(group.label, t)}</p>
            {collapsed && <div aria-hidden className="mx-3 mb-1 border-t border-white/15" />}
            <ul className="space-y-0.5">
              {group.routes.map(({ href, icon: Icon, label }) => {
                const active = isActive(pathname, href);
                const text = labelText(label, t);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      onMouseEnter={show(text)}
                      onMouseLeave={() => setTip(null)}
                      onFocus={show(text)}
                      onBlur={() => setTip(null)}
                      className={cn(
                        "relative flex min-h-[42px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-fast",
                        collapsed && "justify-center",
                        active ? "bg-white/15" : "hover:bg-white/10",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn("absolute -left-1 top-2.5 h-6 w-1 origin-center rounded-r bg-white transition-transform duration-base ease-out", active ? "scale-y-100" : "scale-y-0")}
                      />
                      <Icon className="h-5 w-5 shrink-0" aria-hidden />
                      <span className={cn(collapsed && "sr-only")}>{text}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-3 space-y-3">
        <p className={cn("flex items-start gap-2 px-2 text-xs text-white/80", collapsed && "justify-center px-0")}>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className={cn(collapsed && "sr-only")}>{t("nav.privateNote")}</span>
        </p>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          onMouseEnter={show(t("nav.expand"))}
          onMouseLeave={() => setTip(null)}
          className={cn("flex min-h-control w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/90 hover:bg-white/10", collapsed && "justify-center")}
        >
          {collapsed ? <ChevronsRight className="h-5 w-5" aria-hidden /> : <ChevronsLeft className="h-5 w-5" aria-hidden />}
          <span className={cn(collapsed && "sr-only")}>{t("nav.collapse")}</span>
        </button>
      </div>

      {collapsed && tip && (
        <span aria-hidden style={{ top: tip.top }} className="pointer-events-none fixed left-[84px] z-nav -translate-y-1/2 whitespace-nowrap rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-2">
          {tip.text}
        </span>
      )}
    </aside>
  );
}
