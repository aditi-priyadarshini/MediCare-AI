"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/brand";
import { PageLoading } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth-context";

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
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-sm sm:p-8">
        {children}
      </div>
      <p className="mt-6 max-w-md text-center text-xs text-ink-soft">
        Academic demonstration build. Use synthetic data only; do not enter real medical records.
      </p>
    </main>
  );
}
