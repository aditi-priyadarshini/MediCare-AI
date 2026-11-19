"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ClipboardCheck, Info, Lock } from "lucide-react";
import { Logo } from "@/components/brand";
import { PageLoading } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth-context";

const DEMO_NOTICE = "Academic demonstration build. Use synthetic data only; do not enter real medical records.";

const TRUST = [
  { icon: Lock, title: "Private by default", body: "Only you can see your records unless you choose to share them." },
  { icon: Info, title: "Not a medical device", body: "MediCare AI gives information to support, not replace, advice from a health professional." },
  { icon: ClipboardCheck, title: "You stay in control", body: "Medicines are marked as taken only when you say so." },
] as const;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    if (user.email_verified) router.replace("/dashboard");
    else if (pathname !== "/verify-email") router.replace("/verify-email");
  }, [status, user, pathname, router]);

  if (status === "loading") return <PageLoading />;
  const redirecting =
    status === "authenticated" && user && (user.email_verified || pathname !== "/verify-email");
  if (redirecting) return <PageLoading label="Redirecting" />;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand and trust panel: desktop only. Every line is a plain statement about this build. */}
      <aside className="hidden flex-col justify-between bg-brand-900 p-12 text-white lg:flex">
        <Logo light />
        <div className="max-w-md">
          <p className="text-display">Your health records, in one calm place.</p>
          <ul className="mt-8 space-y-5">
            {TRUST.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-base font-semibold">{title}</span>
                  <span className="block text-sm text-white/80">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/70">{DEMO_NOTICE}</p>
      </aside>

      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-6 lg:hidden">
          <Logo />
        </div>
        <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-sm sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          {children}
        </div>
        <p className="mt-6 max-w-md text-center text-xs text-ink-soft lg:hidden">{DEMO_NOTICE}</p>
      </main>
    </div>
  );
}
