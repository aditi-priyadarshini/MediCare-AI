"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";
import { breadcrumbsFor } from "@/lib/nav";

/** Only nested pages get a trail; top-level pages would just repeat their own title. */
export function Breadcrumbs() {
  const { t } = useT();
  const trail = breadcrumbsFor(usePathname());
  if (trail.length === 0) return null;
  return (
    <nav aria-label={t("nav.breadcrumb")} className="min-w-0">
      <ol className="flex items-center gap-1 text-sm text-ink-soft">
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={c.href} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-ink">
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="truncate rounded hover:text-ink hover:underline">
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
