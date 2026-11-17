"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { useMediaQuery } from "@/lib/hooks";
import { cn } from "@/lib/cn";

/** Width at which the section nav becomes a sticky side list and sections stop collapsing. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * One block of the profile. On a desktop it is a plain card with a heading. On a phone it is an
 * accordion: the heading is a button that opens and closes the panel (`aria-expanded`), so a long
 * profile is not one endless scroll. Children stay mounted while it is closed, so half-typed text is not lost.
 */
export function ProfileSection({
  id,
  title,
  description,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [open, setOpen] = useState(defaultOpen);
  const panel = useId();
  const expanded = desktop || open;

  return (
    <Card id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24 p-0 lg:p-5">
      <h2 id={`${id}-heading`} className="text-h3 font-semibold text-navy-900">
        {desktop ? (
          <span className="block">{title}</span>
        ) : (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panel}
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-control w-full items-center justify-between gap-3 rounded-card px-5 py-3 text-left"
          >
            <span>{title}</span>
            <ChevronDown aria-hidden className={cn("h-5 w-5 shrink-0 text-ink-soft transition-transform duration-fast", open && "rotate-180")} />
          </button>
        )}
      </h2>
      {description && expanded && <p className="px-5 pt-1 text-sm text-ink-soft lg:px-0">{description}</p>}
      <div id={panel} hidden={!expanded} className="px-5 pb-5 pt-3 lg:px-0 lg:pb-0">
        {children}
      </div>
    </Card>
  );
}
