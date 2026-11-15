"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Button, PageLoading } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth-context";
import { ProfileLoader, useProfile } from "@/lib/profile-context";

/** Routes patients to onboarding until the required consents are on record. */
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  const pathname = usePathname();
  const router = useRouter();
  const onboarding = pathname === "/onboarding";

  useEffect(() => {
    if (!profile.onboarding_completed && !onboarding) router.replace("/onboarding");
    if (profile.onboarding_completed && onboarding) router.replace("/dashboard");
  }, [profile.onboarding_completed, onboarding, router]);

  if (profile.onboarding_completed === onboarding) return <PageLoading label="Redirecting" />;
  return onboarding ? <>{children}</> : <AppShell>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    else if (status === "authenticated" && user && !user.email_verified) router.replace("/verify-email");
  }, [status, user, router]);

  if (status !== "authenticated" || !user?.email_verified) return <PageLoading />;

  return (
    <ProfileLoader
      fallback={<PageLoading />}
      errorView={(retry) => (
        <div className="mx-auto max-w-md space-y-3 p-8">
          <Alert tone="danger" title="Couldn’t load your profile">
            Check your connection and try again.
          </Alert>
          <Button onClick={retry}>Try again</Button>
        </div>
      )}
    >
      <OnboardingGate>{children}</OnboardingGate>
    </ProfileLoader>
  );
}
