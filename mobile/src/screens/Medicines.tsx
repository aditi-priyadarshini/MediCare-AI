import React, { useState } from "react";
import { View } from "react-native";
import { api, errorTextOf } from "../api";
import { TopBar, useNav } from "../nav";
import { Badge, Btn, Card, Empty, ErrorNote, Field, fmtDate, H1, H2, Loading, P, Page, RowLink, Screen, styles, useLoad } from "../ui";

export function Medicines() {
  const nav = useNav();
  const meds = useLoad(() => api.medications(), []);
  return (
    <Page>
      <Screen onRefresh={meds.reload} refreshing={meds.loading}>
        <H1>Medicines</H1>
        <Btn title="Add a medicine" onPress={() => nav.go({ name: "addMedicine" })} />
        {meds.error ? <ErrorNote message={meds.error} onRetry={meds.reload} /> : null}
        {meds.loading && !meds.data ? <Loading /> : null}
        {meds.data && meds.data.items.length === 0 ? <Empty title="No medicines yet" body="Add what you take and when, and the app will remind you." /> : null}
        {meds.data?.items.map((m) => (
          <RowLink
            key={m.id}
            title={m.display_name}
            body={[m.dose_text, m.reason].filter(Boolean).join(" · ") || undefined}
            right={m.status !== "active" ? <Badge text={m.status} tone="grey" /> : undefined}
            onPress={() => nav.go({ name: "medicine", id: m.id })}
          />
        ))}
      </Screen>
    </Page>
  );
}

export function MedicineDetail({ id }: { id: string }) {
  const nav = useNav();
  const med = useLoad(() => api.medication(id), [id]);
  const sched = useLoad(() => api.schedules(id), [id]);
  const supplies = useLoad(() => api.supplies(id), [id]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function setStatus(s: "active" | "paused" | "stopped") {
    setBusy(true);
    setErr(null);
    try {
      await api.setMedicationStatus(id, s);
      await med.reload();
    } catch (e) {
      setErr(errorTextOf(e));
    } finally {
      setBusy(false);
    }
  }
  const m = med.data;
  return (
    <Page>
      <TopBar title={m?.display_name ?? "Medicine"} />
      <Screen>
        {med.error ? <ErrorNote message={med.error} onRetry={med.reload} /> : null}
        {!m ? <Loading /> : (
          <>
            <Card>
              <View style={styles.row}><Badge text={m.status} tone={m.status === "active" ? "green" : "grey"} /><Badge text={m.basis === "prescribed" ? "Prescribed" : "Self-reported"} tone="blue" /></View>
              {m.dose_text ? <P>Dose: {m.dose_text}</P> : null}
              {m.strength_text ? <P>Strength: {m.strength_text}</P> : null}
              {m.reason ? <P>For: {m.reason}</P> : null}
              {m.instructions ? <P>{m.instructions}</P> : null}
            </Card>
            <H2>Times</H2>
            {sched.data && sched.data.length === 0 ? <P soft>No schedule yet.</P> : null}
            {sched.data?.map((s) => (
              <Card key={s.id}>
                <P>{s.times.join(", ")}</P>
                <P soft small>{s.every_n_days > 1 ? `Every ${s.every_n_days} days` : s.days_of_week ? "Selected days" : "Every day"} · from {fmtDate(s.start_date)}{s.is_active ? "" : " · paused"}</P>
              </Card>
            ))}
            <H2>Stock</H2>
            {supplies.data && supplies.data.length === 0 ? <P soft>No stock recorded. Add stock on the website.</P> : null}
            {supplies.data?.map((s) => (
              <Card key={s.id}>
                <P>{s.quantity_remaining} of {s.quantity_initial} {s.unit ?? "units"} left</P>
                <P soft small>{s.lot_number ? `Lot ${s.lot_number} · ` : ""}{s.expiry_date ? `Expires ${fmtDate(s.expiry_date)}` : "No expiry date"}</P>
              </Card>
            ))}
            {err ? <ErrorNote message={err} /> : null}
            <View style={styles.row}>
              {m.status === "active" ? <Btn title="Pause" kind="secondary" small busy={busy} onPress={() => void setStatus("paused")} /> : <Btn title="Resume" small busy={busy} onPress={() => void setStatus("active")} />}
              {m.status !== "stopped" ? <Btn title="Stop taking" kind="danger" small disabled={busy} onPress={() => void setStatus("stopped")} /> : null}
            </View>
          </>
        )}
      </Screen>
    </Page>
  );
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const pad = (t: string) => (t.length === 4 ? `0${t}` : t);

export function AddMedicine() {
  const nav = useNav();
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [reason, setReason] = useState("");
  const [times, setTimes] = useState("08:00");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const list = times.split(/[,\s]+/).filter(Boolean);
    if (!list.length || list.some((t) => !TIME.test(t))) {
      setErr("Enter times like 08:00, 20:00 (24-hour clock).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const med = await api.createMedication({ display_name: name.trim(), dose_text: dose.trim() || undefined, reason: reason.trim() || undefined });
      const d = new Date();
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      await api.createSchedule(med.id, { times: list.map(pad), start_date: start });
      nav.back();
    } catch (e) {
      setErr(errorTextOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page>
      <TopBar title="Add a medicine" />
      <Screen>
        <Field label="Medicine name" value={name} onChangeText={setName} placeholder="e.g. Metformin" />
        <Field label="Dose (as on the label)" value={dose} onChangeText={setDose} placeholder="e.g. 500 mg, 1 tablet" />
        <Field label="What it is for (optional)" value={reason} onChangeText={setReason} />
        <Field label="Times each day" value={times} onChangeText={setTimes} hint="24-hour clock, separated by commas: 08:00, 20:00. Starts today." autoCapitalize="none" />
        {err ? <ErrorNote message={err} /> : null}
        <Btn title="Save medicine" busy={busy} disabled={!name.trim()} onPress={() => void save()} />
        <P soft small>This is a record of what you take. It is not medical advice. Ask your doctor or pharmacist about changes.</P>
      </Screen>
    </Page>
  );
}
