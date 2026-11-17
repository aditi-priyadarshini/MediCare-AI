"use client";

import { X } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { useModalBehaviour } from "./Dialog";

/**
 * Side sheet. Same behaviour as Dialog (focus trap, Escape, focus return, click on the scrim closes),
 * but anchored to an edge so it can hold a full navigation list on a phone.
 */
export function Drawer({
  open,
  onClose,
  title,
  closeLabel,
  children,
  side = "right",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
  side?: "left" | "right";
  className?: string;
}) {
  const titleId = useId();
  const { ref, onKeyDown } = useModalBehaviour(open, onClose);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-dialog bg-navy-900/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          "drawer-in absolute inset-y-0 flex w-[min(22rem,100vw)] flex-col overflow-y-auto bg-surface pb-[env(safe-area-inset-bottom)] shadow-3",
          side === "right" ? "right-0" : "left-0",
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id={titleId} className="text-h3 text-navy-900">
            {title}
          </h2>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft hover:bg-mint-100 hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 p-4">{children}</div>
      </div>
    </div>
  );
}
