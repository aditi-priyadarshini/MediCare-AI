import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { EmergencyPanel } from "@/components/emergency/EmergencyPanel";

export const metadata: Metadata = { title: "Emergency" };

/** Public on purpose: calling for help never needs an account, a verified email or onboarding. */
export default function EmergencyPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-5 p-4 sm:p-8">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/dashboard" className="inline-flex min-h-[44px] items-center text-sm font-medium text-teal-700 underline">
          Back to the app
        </Link>
      </header>
      <h1 className="text-2xl font-semibold text-navy-900">Emergency</h1>
      <EmergencyPanel />
    </div>
  );
}
