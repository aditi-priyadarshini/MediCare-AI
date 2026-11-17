"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Button + non-modal panel for content that is not a menu (notifications, display options).
 * Opens with focus on the panel; Escape closes and returns focus to the button; a click or focus
 * landing outside closes it. Focus leaving because an inner button re-rendered does not.
 * On phones the panel spans the screen under the top bar; from `sm` up it hangs below the button.
 */
export function Popover({
  label,
  panelLabel,
  trigger,
  children,
  onOpenChange,
  className,
  panelClassName,
}: {
  /** Accessible name of the button. */
  label: string;
  /** Accessible name of the panel. */
  panelLabel: string;
  trigger: React.ReactNode;
  children: React.ReactNode | ((api: { close: (returnFocus?: boolean) => void }) => React.ReactNode);
  onOpenChange?: (open: boolean) => void;
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const set = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const close = (returnFocus = true) => {
    set(false);
    if (returnFocus) button.current?.focus();
  };

  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) {
        setOpen(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("focusin", away);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("focusin", away);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        onClick={() => set(!open)}
        className="relative inline-flex min-h-control min-w-[44px] items-center justify-center gap-2 rounded-lg border border-line bg-surface px-2 text-sm font-medium text-ink hover:bg-mint-100"
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label={panelLabel}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          className={cn(
            "popover-in fixed inset-x-3 top-[4.5rem] z-nav max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-3",
            "sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[24rem]",
            panelClassName,
          )}
        >
          {typeof children === "function" ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}
