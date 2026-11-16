"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/rules", label: "Safety rules" },
  { href: "/admin/reference", label: "Sources & catalogue" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Administration" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={pathname === t.href ? "page" : undefined}
          className={cn(
            "inline-flex min-h-[44px] shrink-0 items-center border-b-2 px-3 text-sm font-medium",
            pathname === t.href ? "border-teal-700 text-teal-700" : "border-transparent text-ink-soft hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
