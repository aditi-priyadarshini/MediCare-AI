"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

/**
 * Page for adding or editing one thing. Forms live here instead of sitting open on a list page:
 * the list page has an "Add" button that opens this page, and saving returns to the list.
 */
export function FormPage({
  title,
  description,
  backHref,
  backLabel,
  width = "max-w-3xl",
  children,
}: {
  title: string;
  description?: string;
  backHref: string;
  backLabel: string;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full space-y-4", width)}>
      <Link
        href={backHref}
        className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> {backLabel}
      </Link>
      <PageHeader title={title} description={description} className="mb-0" />
      <Card>{children}</Card>
    </div>
  );
}

/** Save / Cancel row at the bottom of a form. */
export function FormActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">{children}</div>;
}

/** After a successful save: show a short message and go back to the list. */
export function useFinish(href: string) {
  const router = useRouter();
  const toast = useToast();
  return useCallback(
    (message?: string, tone: "info" | "success" | "danger" = "success") => {
      if (message) toast.show(message, tone);
      router.push(href);
    },
    [router, toast, href],
  );
}
