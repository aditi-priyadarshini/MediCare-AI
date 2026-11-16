"use client";

import { useState } from "react";
import { LocationButton, Pager, PlaceActions, SourceLine, type Coords } from "@/components/care/Shared";
import { Alert, Button, Card, EmptyState, SelectField, TextField } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import {
  CREDENTIAL_BADGE,
  CREDENTIAL_TONE,
  WINDOWS,
  bookingRange,
  capitalise,
  queryString,
  type Appointment,
  type CarePage,
  type Doctor,
  type Window,
} from "@/lib/care";
import { useAsync } from "@/lib/hooks";

const BADGE: Record<string, string> = {
  success: "bg-success-100 text-success-700",
  info: "bg-info-100 text-info-700",
  warning: "bg-amber-100 text-amber-600",
};

function BookingForm({
  doctor,
  onDone,
  onClose,
}: {
  doctor: Doctor;
  onDone: (a: Appointment) => void;
  onClose: () => void;
}) {
  const range = bookingRange();
  const [date, setDate] = useState("");
  const [window, setWindow] = useState<Window>("any");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return setErrors({ preferred_date: "Choose a day." });
    setErrors({});
    setBusy(true);
    setFailure(null);
    try {
      const made = await api<Appointment>("/appointments", {
        method: "POST",
        body: { doctor_id: doctor.id, preferred_date: date, preferred_window: window, reason: reason.trim() || undefined },
      });
      onDone(made);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-line bg-mint-100 p-4" aria-label={`Request an appointment with ${doctor.display_name}`}>
      <Alert tone={doctor.booking_mode === "provider" ? "info" : "warning"} title="Before you send">
        {doctor.appointment_note}
      </Alert>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Preferred day"
          type="date"
          min={range.min}
          max={range.max}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={errors.preferred_date}
        />
        <SelectField
          label="Preferred time"
          value={window}
          onChange={(e) => setWindow(e.target.value as Window)}
          options={WINDOWS}
        />
      </div>
      <TextField
        label="Reason for the visit"
        hint="Optional. Only you can see this. It is not shared with the clinic."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        error={errors.reason}
        optional
      />
      {failure && <Alert tone="danger" title="Could not save the request">{failure}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          {doctor.booking_mode === "provider" ? "Send request" : "Save request"}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function DoctorFinder({ onBooked }: { onBooked: () => void }) {
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [result, setResult] = useState<CarePage<Doctor> | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Appointment | null>(null);
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
      {confirmation && (
        <Alert tone={confirmation.status === "sent" ? "info" : "warning"} title="Request recorded">
          {confirmation.status_text} You can see it under Appointments.
        </Alert>
      )}

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
          <ul className="space-y-3">
            {result.items.map((d) => (
              <li key={d.id} className="space-y-2 rounded-lg border border-line p-4">
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
                {booking === d.id ? (
                  <BookingForm
                    doctor={d}
                    onClose={() => setBooking(null)}
                    onDone={(a) => {
                      setBooking(null);
                      setConfirmation(a);
                      onBooked();
                    }}
                  />
                ) : (
                  <Button variant="secondary" onClick={() => { setConfirmation(null); setBooking(d.id); }}>
                    Request an appointment
                  </Button>
                )}
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
