import React, { useState } from "react";
import { Linking, View } from "react-native";
import { api, errorTextOf } from "../api";
import { TopBar } from "../nav";
import { Badge, Btn, Card, Empty, ErrorNote, Field, fmtDate, fmtTime, H1, H2, Loading, P, Page, RowLink, Screen, styles, useLoad } from "../ui";
import type { AppNotification, CareSearch, Doctor, Pharmacy } from "../types";

// ----------------------------------------------------------------------------- profile
export function Profile() {
  const p = useLoad(() => api.profile(), []);
  const cond = useLoad(() => api.conditions(), []);
  const al = useLoad(() => api.allergies(), []);
  const ct = useLoad(() => api.contacts(), []);
  return (
    <Page>
      <TopBar title="Health profile" />
      <Screen>
        {p.error ? <ErrorNote message={p.error} onRetry={p.reload} /> : null}
        {!p.data ? <Loading /> : (
          <Card>
            <H2>{p.data.display_name}</H2>
            <P>Blood group: {p.data.blood_group ?? "not set"}</P>
            <P>Date of birth: {p.data.date_of_birth ? fmtDate(p.data.date_of_birth) : "not set"}</P>
            <P>Height / weight: {p.data.height_cm ?? "–"} cm / {p.data.weight_kg ?? "–"} kg</P>
            <Badge text={`Profile ${p.data.completeness}% complete`} tone="mint" />
          </Card>
        )}
        <H2>Conditions</H2>
        {cond.data?.items.length === 0 ? <P soft>None recorded.</P> : null}
        {cond.data?.items.map((x) => <Card key={x.id}><P>{x.display_name}</P><P soft small>{x.status} · {x.verification_status.replace(/_/g, " ")}</P></Card>)}
        <H2>Allergies</H2>
        {al.data?.items.length === 0 ? <P soft>None recorded.</P> : null}
        {al.data?.items.map((x) => <Card key={x.id} tone={x.severity === "severe" ? "red" : undefined}><P>{x.substance}</P><P soft small>{[x.reaction, x.severity].filter(Boolean).join(" · ")}</P></Card>)}
        <H2>Emergency contacts</H2>
        {ct.data?.items.length === 0 ? <P soft>None recorded.</P> : null}
        {ct.data?.items.map((x) => <Card key={x.id}><P>{x.name}{x.is_primary ? " (primary)" : ""}</P><P soft small>{[x.relationship, x.email].filter(Boolean).join(" · ")}</P></Card>)}
        <P soft small>Edit your profile on the website.</P>
      </Screen>
    </Page>
  );
}

// ------------------------------------------------------------------------------ safety
const TONE = { contraindicated: "red", major: "red", moderate: "amber", minor: "blue", unknown: "grey" } as const;
export function Safety() {
  const s = useLoad(() => api.safetyOverview(), []);
  return (
    <Page>
      <TopBar title="Safety checker" />
      <Screen onRefresh={s.reload} refreshing={s.loading}>
        {s.error ? <ErrorNote message={s.error} onRetry={s.reload} /> : null}
        {s.loading && !s.data ? <Loading /> : null}
        {s.data ? (
          <>
            <Card tone={s.data.status === "needs_attention" ? "red" : s.data.status === "review" ? "amber" : "green"}>
              <H2>{s.data.status === "needs_attention" ? "Needs attention" : s.data.status === "review" ? "Worth reviewing" : s.data.status === "insufficient_data" ? "Not enough information" : "No matching warnings found"}</H2>
              <P soft small>Based on {s.data.context.medications} medicines, {s.data.context.conditions} conditions and {s.data.context.allergies} allergies you recorded.</P>
            </Card>
            {s.data.issues.map((i, k) => (
              <Card key={k}>
                <View style={styles.row}><Badge text={i.severity} tone={TONE[i.severity as keyof typeof TONE] ?? "grey"} /><Badge text={i.section.replace(/_/g, " ")} tone="grey" /></View>
                <P>{i.title}</P>
                <P soft small>{i.detail}</P>
                {i.guidance ? <P small>{i.guidance}</P> : null}
              </Card>
            ))}
            {s.data.notes.map((n, k) => <P key={k} soft small>{n}</P>)}
            <P soft small>{s.data.disclaimer}</P>
          </>
        ) : null}
      </Screen>
    </Page>
  );
}

// --------------------------------------------------------------------------------- care
export function Care() {
  const [mode, setMode] = useState<"doctors" | "pharmacies">("doctors");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [res, setRes] = useState<CareSearch<Doctor> | CareSearch<Pharmacy> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function search() {
    setBusy(true);
    setErr(null);
    try {
      setRes(mode === "doctors" ? await api.doctors(q, city) : await api.pharmacies(q, city));
    } catch (e) {
      setErr(errorTextOf(e));
    } finally {
      setBusy(false);
    }
  }
  const call = (phone: string | null) => phone && void Linking.openURL(`tel:${phone.replace(/\s/g, "")}`);
  return (
    <Page>
      <TopBar title="Find care" />
      <Screen>
        <View style={styles.row}>
          <Btn title="Doctors" small kind={mode === "doctors" ? "primary" : "secondary"} onPress={() => { setMode("doctors"); setRes(null); }} />
          <Btn title="Pharmacies" small kind={mode === "pharmacies" ? "primary" : "secondary"} onPress={() => { setMode("pharmacies"); setRes(null); }} />
        </View>
        <Field label={mode === "doctors" ? "Name or speciality" : "Pharmacy name"} value={q} onChangeText={setQ} />
        <Field label="City" value={city} onChangeText={setCity} />
        <Btn title="Search" busy={busy} onPress={() => void search()} />
        {err ? <ErrorNote message={err} /> : null}
        {res ? <P soft small>{res.notice}</P> : null}
        {res && res.items.length === 0 ? <Empty title="Nothing found" /> : null}
        {res?.items.map((x) => {
          const d = x as Doctor & Pharmacy;
          const name = mode === "doctors" ? d.display_name : d.name;
          return (
            <Card key={x.id}>
              <H2>{name}</H2>
              <P soft small>{[d.clinic_name, d.address_line, d.city].filter(Boolean).join(", ")}</P>
              {mode === "doctors" ? <P small>{d.specialties.join(", ")} · {d.credential_label}</P> : d.hours_text ? <P small>{d.hours_text}</P> : null}
              {d.phone ? <Btn title={`Call ${d.phone}`} small kind="secondary" onPress={() => call(d.phone)} /> : null}
            </Card>
          );
        })}
        <P soft small>Booking appointments is available on the website.</P>
      </Screen>
    </Page>
  );
}

// ----------------------------------------------------------------------------- emergency
export function Emergency() {
  const st = useLoad(() => api.emergencyStatus(), []);
  const sum = useLoad(() => api.emergencySummary(), []);
  const number = st.data?.emergency_number ?? "112";
  return (
    <Page>
      <TopBar title="Emergency" />
      <Screen>
        <Card tone="red">
          <H1>In an emergency, call {number}</H1>
          <Btn title={`Call ${number} now`} kind="danger" onPress={() => void Linking.openURL(`tel:${number}`)} />
          <P soft small>This opens your phone’s dialer. The app does not send an ambulance for you.</P>
        </Card>
        <H2>My emergency summary</H2>
        {sum.error ? <ErrorNote message={sum.error} onRetry={sum.reload} /> : null}
        {!sum.data && sum.loading ? <Loading /> : null}
        {sum.data ? (
          <Card>
            <P>{sum.data.display_name}</P>
            {sum.data.blood_group ? <P>Blood group: {sum.data.blood_group}</P> : null}
            {sum.data.allergies ? <P>Allergies: {sum.data.allergies.map((a) => a.substance).join(", ") || "none recorded"}</P> : null}
            {sum.data.conditions ? <P>Conditions: {sum.data.conditions.map((a) => a.display_name).join(", ") || "none recorded"}</P> : null}
            {sum.data.medications ? <P>Medicines: {sum.data.medications.map((a) => a.display_name).join(", ") || "none recorded"}</P> : null}
            {sum.data.contacts ? <P>Contacts: {sum.data.contacts.map((a) => a.name).join(", ") || "none recorded"}</P> : null}
            {sum.data.limitations.map((l, i) => <P key={i} soft small>{l}</P>)}
          </Card>
        ) : null}
        <P soft small>Choose what appears here on the website.</P>
      </Screen>
    </Page>
  );
}

// ------------------------------------------------------------------------------ sharing
export function Share() {
  const s = useLoad(() => api.shares(), []);
  const [err, setErr] = useState<string | null>(null);
  async function revoke(id: string) {
    try {
      await api.revokeShare(id);
      await s.reload();
    } catch (e) {
      setErr(errorTextOf(e));
    }
  }
  return (
    <Page>
      <TopBar title="Care sharing" />
      <Screen onRefresh={s.reload} refreshing={s.loading}>
        {s.error ? <ErrorNote message={s.error} onRetry={s.reload} /> : null}
        {err ? <ErrorNote message={err} /> : null}
        {s.data && s.data.items.length === 0 ? <Empty title="Nothing shared" body="Create a share link on the website." /> : null}
        {s.data?.items.map((x) => (
          <Card key={x.id}>
            <View style={styles.row}><P>{x.recipient_name}</P><Badge text={x.status} tone={x.status === "active" ? "green" : "grey"} /></View>
            <P soft small>{x.recipient_email} · {x.categories.join(", ")}</P>
            <P soft small>Expires {fmtDate(x.expires_at)} · opened {x.access_count} times</P>
            {x.status === "active" ? <Btn title="Stop sharing" kind="danger" small onPress={() => void revoke(x.id)} /> : null}
          </Card>
        ))}
        <P soft small>New share links are created on the website, so you can preview exactly what the person will see.</P>
      </Screen>
    </Page>
  );
}

// ------------------------------------------------------------------------ notifications
export function Notifications() {
  const n = useLoad(() => api.notifications(), []);
  const [err, setErr] = useState<string | null>(null);
  async function readAll() {
    try {
      await api.markAllRead();
      await n.reload();
    } catch (e) {
      setErr(errorTextOf(e));
    }
  }
  async function read(x: AppNotification) {
    if (x.read_at) return;
    await api.markRead(x.id).catch(() => {});
    await n.reload();
  }
  return (
    <Page>
      <TopBar title="Notifications" />
      <Screen onRefresh={n.reload} refreshing={n.loading}>
        {n.error ? <ErrorNote message={n.error} onRetry={n.reload} /> : null}
        {err ? <ErrorNote message={err} /> : null}
        {n.data && n.data.items.length === 0 ? <Empty title="Nothing new" /> : null}
        {n.data && n.data.items.some((x) => !x.read_at) ? <Btn title="Mark all as read" kind="secondary" small onPress={() => void readAll()} /> : null}
        {n.data?.items.map((x) => (
          <RowLink key={x.id} title={x.title} body={`${x.body} · ${fmtDate(x.due_at)} ${fmtTime(x.due_at)}`} right={x.read_at ? undefined : <Badge text="New" tone="blue" />} onPress={() => void read(x)} />
        ))}
      </Screen>
    </Page>
  );
}
