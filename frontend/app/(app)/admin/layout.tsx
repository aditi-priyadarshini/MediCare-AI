"use client";

import { AdminNav } from "@/components/admin/AdminNav";
import { Alert } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth-context";

/**
 * Hides the console from non-admins. This is a courtesy: every /admin API call is refused
 * by the server for anyone who is not an administrator, whatever the browser shows.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "admin") {
    return (
      <Alert tone="info" title="Not available">
        This area is for administrators.
      </Alert>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Administration</h1>
        <p className="mt-1 text-ink-soft">
          Reference data, accounts, feedback and the audit log. Administrators cannot open patients’ health records.
        </p>
      </div>
      <AdminNav />
      {children}
    </div>
  );
}
