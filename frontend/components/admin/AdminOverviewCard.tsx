"use client";

import Link from "next/link";
import { Alert, Card, PageLoading } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import type { AdminOverview } from "@/lib/admin";
import { useAsync } from "@/lib/hooks";

function Stat({ label, value, href, attention }: { label: string; value: number; href: string; attention?: boolean }) {
  return (
    <li>
      <Link
        href={href}
        className="block min-h-[44px] rounded-lg border border-line p-4 hover:bg-mint-100 focus-visible:outline focus-visible:outline-2"
      >
        <span className="block text-2xl font-semibold text-navy-900">{value}</span>
        <span className="text-sm text-ink-soft">{label}</span>
        {attention && value > 0 && <span className="ml-2 text-sm font-medium text-amber-600">Needs attention</span>}
      </Link>
    </li>
  );
}

export function AdminOverviewCard() {
  const o = useAsync(() => api<AdminOverview>("/admin/overview"));
  if (o.loading && !o.data) return <PageLoading label="Loading overview" />;
  if (!o.data)
    return (
      <Alert tone="danger" title="Could not load the overview">
        Check your connection and try again.
      </Alert>
    );
  const d = o.data;
  return (
    <Card aria-labelledby="overview-h" className="space-y-4">
      <h2 id="overview-h" className="text-lg font-semibold text-ink">
        At a glance
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Accounts" value={d.users} href="/admin/accounts" />
        <Stat label="Deactivated accounts" value={d.inactive_users} href="/admin/accounts" />
        <Stat label="New feedback" value={d.feedback_new} href="/admin/feedback" attention />
        <Stat label="Active safety rules" value={d.rules_active} href="/admin/rules" />
        <Stat label="Rules awaiting second-person review" value={d.rules_unreviewed} href="/admin/rules" attention />
        <Stat label="Reference sources" value={d.sources} href="/admin/reference" />
        <Stat label="Catalogue medicines" value={d.medicines} href="/admin/reference" />
      </ul>
      <p className="text-sm text-ink-soft">
        Counts only. The bundled safety data is a synthetic demonstration set and has not been clinically reviewed.
      </p>
    </Card>
  );
}
