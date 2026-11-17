"use client";

import { useState } from "react";
import { Alert, Button, SelectField, TextField } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { WINDOWS, bookingRange, type Appointment, type Doctor, type Window } from "@/lib/care";

/** Ask for an appointment with one doctor. Opens on its own page (/care/book/<id>). */
export function BookingForm({
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
    <form onSubmit={submit} className="space-y-4" aria-label={`Request an appointment with ${doctor.display_name}`}>
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

