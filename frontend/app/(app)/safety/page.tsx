"use client";

import { ArrowRight, ArrowLeftRight, ClipboardList, PackageCheck, Pill, Search, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/primitives";

const TOOLS: Array<{ href: string; title: string; text: string; icon: LucideIcon }> = [
  { href: "/safety/medicines", title: "My medicines", text: "See what needs attention in everything you take now.", icon: Pill },
  { href: "/safety/lookup", title: "Look up a medicine", text: "Check any medicine against your list, conditions and allergies.", icon: Search },
  { href: "/safety/alternatives", title: "Compare medicines", text: "Find products with the same ingredients, and their prices.", icon: ArrowLeftRight },
  { href: "/safety/report", title: "Note a side effect", text: "Keep a private record of anything you noticed.", icon: ClipboardList },
  { href: "/safety/authenticity", title: "Is this pack genuine?", text: "Check a barcode or lot number.", icon: PackageCheck },
];

export default function SafetyPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Safety Checker" description="Pick what you want to do. Each tool has its own page." />
      <Alert tone="info" title="A guide, not advice">
        These tools use a small reference dataset. Finding nothing does not mean something is safe. Talk to a
        pharmacist or your prescriber before you start, stop or change a medicine.
      </Alert>
      <ul className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map(({ href, title, text, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex h-full items-start gap-4 rounded-card border border-line bg-surface p-5 shadow-sm transition-colors hover:border-teal-700"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-mint-100 text-teal-700">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{title}</span>
                <span className="mt-1 block text-sm text-ink-soft">{text}</span>
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-soft group-hover:text-teal-700" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
