"use client";

import { useState } from "react";
import { LocationButton, Pager, PlaceActions, SourceLine, type Coords } from "@/components/care/Shared";
import { LinkButton } from "@/components/ui/LinkButton";
import { Alert, Button, Card, EmptyState, SelectField, TextField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { CREDENTIAL_BADGE, CREDENTIAL_TONE, capitalise, queryString, type CarePage, type Doctor } from "@/lib/care";
import { useAsync } from "@/lib/hooks";

const BADGE: Record<string, string> = {
  success: "bg-success-100 text-success-700",
  info: "bg-info-100 text-info-700",
  warning: "bg-amber-100 text-amber-600",
};

export function DoctorFinder() {
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [result, setResult] = useState<CarePage<Doctor> | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const specialties = useAsync(() => api<string[]>("/doctors/specialties"), []);

  async function search(e?: React.FormEvent, offset = 0) {
    e?.preventDefault();
    setBusy(true);
    setFailure(null);
    try {
      const qs = queryString({
        q: q.trim(),
        specialty,
        city: city.trim(),
        language: language.trim(),
        verified_only: verifiedOnly,
        lat: coords?.lat,
        lon: coords?.lon,
        limit: 20,
        offset: offset || undefined,
      });
      setResult(await api<CarePage<Doctor>>(`/doctors/search${qs}`));
    } catch (err) {
      setResult(null);
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="dr-h" className="space-y-4">
      <div>
        <h2 id="dr-h" className="text-lg font-semibold text-ink">
          Find a doctor
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Every credential says how it was checked. Doctors are not ranked and this is not a recommendation.
        </p>
      </div>
      <form onSubmit={search} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Doctor or clinic name" value={q} onChange={(e) => setQ(e.target.value)} optional />
          <SelectField
            label="Specialty"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            options={[
              { value: "", label: "Any specialty" },
              ...(specialties.data ?? []).map((s) => ({ value: s, label: capitalise(s) })),
            ]}
          />
          <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} optional />
          <TextField label="Language spoken" value={language} onChange={(e) => setLanguage(e.target.value)} optional />
        </div>
        <label className="flex min-h-[44px] items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5 accent-teal-700"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
          />
          Only show doctors whose credentials have been verified
        </label>
        <LocationButton coords={coords} onChange={setCoords} />
        <Button type="submit" loading={busy}>
          Search doctors
        </Button>
      </form>

      {failure && <Alert tone="danger" title="Search failed">{failure}</Alert>}

      {result && (
        <div className="space-y-3" aria-live="polite">
          <Alert tone="info">{result.notice}</Alert>
          <p className="text-sm text-ink-soft">
            {result.total} {result.total === 1 ? "doctor" : "doctors"} found
            {coords ? ", nearest first. Doctors without a listed location are not shown." : ", listed by name."}
          </p>
          {result.items.length === 0 && (
            <EmptyState title="No doctors found">Try fewer filters, or turn off the verified-only filter.</EmptyState>
          )}
          <ul className="grid gap-4 xl:grid-cols-2">
            {result.items.map((d) => (
              <li key={d.id} className="space-y-2 self-start rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-ink">{d.display_name}</h3>
                    {d.clinic_name && <p className="text-sm text-ink-soft">{d.clinic_name}</p>}
                    <p className="text-sm text-ink-soft">
                      {[d.address_line, d.city, d.state, d.postal_code].filter(Boolean).join(", ")}
                    </p>
                    {d.specialties.length > 0 && <p className="text-sm">{d.specialties.map(capitalise).join(", ")}</p>}
                    {d.languages.length > 0 && (
                      <p className="text-sm text-ink-soft">Speaks {d.languages.map(capitalise).join(", ")}</p>
                    )}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${BADGE[CREDENTIAL_TONE[d.credential_status]]}`}>
                    {CREDENTIAL_BADGE[d.credential_status]}
                  </span>
                </div>
                <p className="text-sm text-ink-soft">{d.credential_label}</p>
                {d.credentials.length > 0 && (
                  <ul className="text-xs text-ink-soft">
                    {d.credentials.map((c, i) => (
                      <li key={i}>
                        {c.qualification}
                        {c.registration_masked ? `, registration ${c.registration_masked}` : ""}
                        {c.issuing_authority ? `, ${c.issuing_authority}` : ""}: {c.label}
                      </li>
                    ))}
                  </ul>
                )}
                <PlaceActions phone={d.phone} latitude={d.latitude} longitude={d.longitude} distanceKm={d.distance_km} />
                <p className="text-sm text-ink-soft">{d.appointment_note}</p>
                <LinkButton href={`/care/book/${d.id}`} variant="secondary">
                  Request an appointment
                </LinkButton>
                <SourceLine source={d.source} freshness={d.freshness} />
              </li>
            ))}
          </ul>
          <Pager result={result} onPage={(offset) => void search(undefined, offset)} />
        </div>
      )}
    </Card>
  );
}
