"use client";

import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";

export interface ProfileSectionLink {
  id: string;
  label: MessageKey;
}

/**
 * Sticky list of jump links, shown from the desktop width up. They are ordinary in-page anchors, so
 * they work without script and a keyboard user lands on the section's heading.
 */
export function ProfileNav({ sections }: { sections: ProfileSectionLink[] }) {
  const { t } = useT();
  return (
    <nav aria-label={t("prof.sections")} className="sticky top-24 hidden self-start lg:block">
      <ul className="space-y-1 border-l border-line">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="-ml-px flex min-h-control items-center border-l-2 border-transparent px-3 text-sm font-medium text-ink-soft hover:border-teal-500 hover:text-ink focus-visible:border-teal-700"
            >
              {t(s.label)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
