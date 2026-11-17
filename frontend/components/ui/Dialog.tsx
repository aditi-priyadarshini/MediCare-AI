"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./primitives";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Shared modal behaviour for Dialog and Drawer: focus moves in, Tab is trapped, Escape closes, and
 * focus returns to whatever opened it.
 */
export function useModalBehaviour(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    return () => returnTo.current?.focus();
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const [a, z] = [items[0]!, items[items.length - 1]!];
    if (e.shiftKey && document.activeElement === a) {
      e.preventDefault();
      z.focus();
    } else if (!e.shiftKey && document.activeElement === z) {
      e.preventDefault();
      a.focus();
    }
  };

  return { ref, onKeyDown };
}

/**
 * Modal dialog: focus moves in, Tab is trapped, Escape closes, focus returns to the trigger.
 * Use role="alertdialog" for destructive/irreversible confirmations.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  role = "dialog",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  role?: "dialog" | "alertdialog";
  className?: string;
}) {
  const titleId = useId();
  const { ref, onKeyDown } = useModalBehaviour(open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-dialog flex items-end justify-center bg-navy-900/50 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn("w-full max-w-md rounded-lg bg-surface p-6 shadow-3", className)}
      >
        <h2 id={titleId} className="text-h2 text-navy-900">
          {title}
        </h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmationDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} role={destructive ? "alertdialog" : "dialog"}>
      {children && <div className="text-sm text-ink">{children}</div>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
