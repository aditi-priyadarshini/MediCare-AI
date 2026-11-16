"use client";

import { Alert, VerificationBadge } from "@/components/ui/primitives";
import { flagText, labValue, rangeText, type SharedSummary } from "@/lib/sharing";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">{title}</h3>
      {children}
    </section>
  );
}

const None = ({ what }: { what: string }) => <p className="text-sm text-ink-soft">No {what} recorded.</p>;

/** Renders exactly what a recipient sees. Used for the patient's preview and the recipient page. */
export function SharedSummaryView({ summary }: { summary: SharedSummary }) {
  const range = rangeText(summary.date_from, summary.date_to);
  return (
    <div className="space-y-5">
      {range && <p className="text-sm text-ink-soft">{range} (lab results and records).</p>}

      {summary.profile && (
        <Section title="Patient">
          <p className="text-sm text-ink">
            <span className="font-medium">{summary.profile.display_name}</span>
            {summary.profile.date_of_birth ? `, born ${summary.profile.date_of_birth}` : ""}
          </p>
          {summary.profile.blood_group && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
              Blood group {summary.profile.blood_group}
              <VerificationBadge status={summary.profile.blood_group_verification_status} />
            </p>
          )}
        </Section>
      )}

      {summary.conditions && (
        <Section title="Conditions">
          {summary.conditions.length === 0 ? (
            <None what="active conditions" />
          ) : (
            <ul className="space-y-1">
              {summary.conditions.map((c, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  {c.display_name}
                  {c.onset_date ? <span className="text-ink-soft">since {c.onset_date}</span> : null}
                  <VerificationBadge status={c.verification_status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {summary.allergies && (
        <Section title="Allergies">
          {summary.allergies.length === 0 ? (
            <None what="active allergies" />
          ) : (
            <ul className="space-y-1">
              {summary.allergies.map((a, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  <span className="font-medium">{a.substance}</span>
                  {a.reaction ? <span>{a.reaction}</span> : null}
                  {a.severity ? <span className="text-ink-soft">({a.severity})</span> : null}
                  <VerificationBadge status={a.verification_status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {summary.medications && (
        <Section title="Medicines">
          {summary.medications.length === 0 ? (
            <None what="medicines" />
          ) : (
            <ul className="space-y-2">
              {summary.medications.map((m, i) => (
                <li key={i} className="text-sm text-ink">
                  <span className="font-medium">{m.display_name}</span>
                  {[m.strength_text, m.form, m.dose_text].filter(Boolean).length > 0 &&
                    ` · ${[m.strength_text, m.form, m.dose_text].filter(Boolean).join(" · ")}`}
                  <span className="ml-2 text-ink-soft">
                    {m.status === "paused" ? "Paused" : "Listed as active"},{" "}
                    {m.basis === "prescribed" ? "from a prescription" : "reported by the patient"}
                    {m.as_needed ? ", as needed" : ""}
                  </span>
                  {m.instructions && <p className="text-ink-soft">Instructions as written: {m.instructions}</p>}
                  <VerificationBadge status={m.verification_status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {summary.labs && (
        <Section title="Lab results">
          {summary.labs.length === 0 ? (
            <None what="lab results" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="text-ink-soft">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Test</th>
                    <th className="py-1 pr-3 font-medium">Value</th>
                    <th className="py-1 pr-3 font-medium">Report range</th>
                    <th className="py-1 pr-3 font-medium">Date</th>
                    <th className="py-1 font-medium">Compared with range</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.labs.map((l, i) => (
                    <tr key={i} className="border-t border-line align-top">
                      <td className="py-1.5 pr-3 font-medium text-ink">{l.test_name}</td>
                      <td className="py-1.5 pr-3">{labValue(l)}</td>
                      <td className="py-1.5 pr-3 text-ink-soft">
                        {l.ref_low !== null || l.ref_high !== null ? `${l.ref_low ?? "…"} to ${l.ref_high ?? "…"}` : "None"}
                      </td>
                      <td className="py-1.5 pr-3">{l.observed_on}</td>
                      <td className="py-1.5">
                        {flagText(l.flag)} <VerificationBadge status={l.verification_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {summary.records && (
        <Section title="Records">
          {summary.records.length === 0 ? (
            <None what="records" />
          ) : (
            <ul className="space-y-1">
              {summary.records.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-ink-soft">
                    {r.record_type.replace("_", " ")}
                    {r.record_date ? `, ${r.record_date}` : ""}
                    {r.provider_name ? `, ${r.provider_name}` : ""}
                  </span>
                  <VerificationBadge status={r.verification_status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Alert tone="info" title="Read this first">
        <ul className="list-disc space-y-0.5 pl-4">
          {summary.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Alert>
    </div>
  );
}
