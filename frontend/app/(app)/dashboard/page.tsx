"use client";

import { CalendarClock, MapPin } from "lucide-react";
import Link from "next/link";
import { Card, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { useProfile } from "@/lib/profile-context";
import type { Page } from "@/lib/types";

const COMING = [
  { label: "Find care", icon: MapPin },
];

export default function DashboardPage() {
  const { profile } = useProfile();
  const counts = useAsync(async () => {
    const [c, a, e, r, l, m] = await Promise.all([
      api<Page<unknown>>("/conditions?limit=1"),
      api<Page<unknown>>("/allergies?limit=1"),
      api<Page<unknown>>("/emergency/contacts?limit=1"),
      api<Page<unknown>>("/records?limit=1"),
      api<Page<unknown>>("/labs?limit=1"),
      api<Page<unknown>>("/medications?limit=1"),
    ]);
    return { conditions: c.total, allergies: a.total, contacts: e.total, records: r.total, labs: l.total, medicines: m.total };
  }, []);

  const firstName = profile.display_name.split(" ")[0];
  const checklist = [
    { label: "Date of birth", done: profile.date_of_birth !== null },
    { label: "Height and weight", done: profile.height_cm !== null && profile.weight_kg !== null },
    { label: "Blood group", done: profile.blood_group !== null },
    { label: "Emergency contact", done: (counts.data?.contacts ?? 0) > 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Hello, {firstName}</h1>
        <p className="mt-1 text-ink-soft">Here’s where your health record stands today.</p>
      </div>

      <Card aria-labelledby="completeness">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="completeness" className="font-semibold text-navy-900">
            Profile completeness
          </h2>
          <span className="text-lg font-semibold tabular-nums text-teal-700">{profile.completeness}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={profile.completeness}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Profile completeness"
          className="mt-3 h-2 overflow-hidden rounded-full bg-line"
        >
          <div className="h-full bg-teal-500" style={{ width: `${profile.completeness}%` }} />
        </div>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {checklist.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              <span aria-hidden>{c.done ? "✓" : "○"}</span>
              <span className={c.done ? "text-ink" : "text-ink-soft"}>
                {c.label} <span className="sr-only">{c.done ? "(done)" : "(not added yet)"}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-soft">
          This shows how much of your profile is filled in. It is not a measure of your health.
        </p>
        <Link href="/profile" className="mt-3 inline-block text-sm font-semibold text-teal-700 underline">
          Complete your profile
        </Link>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Conditions", counts.data?.conditions, "/profile"],
          ["Allergies", counts.data?.allergies, "/profile"],
          ["Emergency contacts", counts.data?.contacts, "/profile"],
          ["Records", counts.data?.records, "/records"],
          ["Lab results", counts.data?.labs, "/labs"],
          ["Medicines", counts.data?.medicines, "/medications"],
        ].map(([label, n, href]) => (
          <Card key={label as string}>
            <Link href={href as string} className="text-sm text-ink-soft underline-offset-2 hover:underline">
              {label}
            </Link>
            {counts.loading ? (
              <Skeleton className="mt-2 h-8 w-12" />
            ) : (
              <p className="mt-1 text-3xl font-semibold tabular-nums text-navy-900">{n ?? "–"}</p>
            )}
          </Card>
        ))}
      </div>

      <section aria-labelledby="coming">
        <h2 id="coming" className="mb-3 flex items-center gap-2 font-semibold text-navy-900">
          <CalendarClock className="h-5 w-5 text-ink-soft" aria-hidden /> Coming in later releases
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {COMING.map(({ label, icon: Icon }) => (
            <div
              key={label}
              aria-disabled="true"
              className="flex min-h-[88px] flex-col items-start justify-between rounded-card border border-dashed border-line p-3 text-ink-soft"
            >
              <Icon className="h-5 w-5" aria-hidden />
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs">Not available yet</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
