import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { api, errorTextOf } from "../api";
import { useNav } from "../nav";
import { useSession } from "../session";
import { Badge, Btn, Card, Empty, ErrorNote, fmtTime, H1, H2, Loading, P, Page, RowLink, Screen, styles, useLoad } from "../ui";
import type { Dose, SafetyOverview } from "../types";

function todayWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

const SAFETY_TEXT: Record<string, [string, "red" | "amber" | "green" | "grey"]> = {
  needs_attention: ["Needs attention", "red"],
  review: ["Worth reviewing", "amber"],
  no_matching_record: ["Nothing found", "green"],
  insufficient_data: ["Add more details", "grey"],
};

function DoseRow({ dose, onChanged }: { dose: Dose; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(errorTextOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card tone={dose.overdue && dose.status === "pending" ? "amber" : undefined}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <P>{dose.medication_name ?? "Medicine"}</P>
          <P soft small>{[fmtTime(dose.scheduled_at), dose.dose_text].filter(Boolean).join(" · ")}</P>
        </View>
        {dose.status === "taken" ? <Badge text="Taken" tone="green" /> : dose.status === "skipped" ? <Badge text="Skipped" tone="grey" /> : dose.overdue ? <Badge text="Overdue" tone="amber" /> : <Badge text="Due" tone="blue" />}
      </View>
      {err ? <P color="#b42332" small>{err}</P> : null}
      {dose.status === "pending" ? (
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Btn title="I took it" small busy={busy} onPress={() => void act(() => api.takeDose(dose.id))} /></View>
          <View style={{ flex: 1 }}><Btn title="Skip" kind="secondary" small disabled={busy} onPress={() => void act(() => api.skipDose(dose.id))} /></View>
        </View>
      ) : (
        <Btn title="Undo" kind="ghost" small disabled={busy} onPress={() => void act(() => api.resetDose(dose.id))} />
      )}
    </Card>
  );
}

export function Home() {
  const { user } = useSession();
  const nav = useNav();
  const [tick, setTick] = useState(0);
  const doses = useLoad(() => { const w = todayWindow(); return api.doses(w.from, w.to); }, [tick]);
  const alerts = useLoad(() => api.alerts(), [tick]);
  const unread = useLoad(() => api.unreadCount(), [tick]);
  const consents = useLoad(() => api.consents(), [tick]);
  const safety = useLoad<SafetyOverview | null>(() => api.safetyOverview().catch(() => null), [tick]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const callOn = consents.data?.find((x) => x.consent_type === "reminder_call")?.granted ?? false;
  const s = safety.data ? SAFETY_TEXT[safety.data.status] : undefined;

  return (
    <Page>
      <Screen onRefresh={refresh} refreshing={doses.loading}>
        <H1>{`Hello, ${user.display_name ?? "there"}`}</H1>

        <H2>Today’s doses</H2>
        {doses.error ? <ErrorNote message={doses.error} onRetry={doses.reload} /> : null}
        {doses.loading && !doses.data ? <Loading /> : null}
        {doses.data && doses.data.items.length === 0 ? <Empty title="No doses today" body="Add a medicine with times to get reminders." /> : null}
        {doses.data?.items.map((d) => <DoseRow key={d.id} dose={d} onChanged={refresh} />)}

        {alerts.data && alerts.data.length > 0 ? (
          <>
            <H2>Needs attention</H2>
            {alerts.data.map((a, i) => (
              <Card key={i} tone="amber">
                <P>{a.medication_name}</P>
                <P soft small>
                  {a.kind === "refill_soon" ? "Running low: refill soon" : a.kind === "out_of_stock" ? "Out of stock" : a.kind === "expiring_soon" ? `Expires soon${a.expiry_date ? ` (${a.expiry_date})` : ""}` : "Expired"}
                </P>
              </Card>
            ))}
          </>
        ) : null}

        <H2>Safety check</H2>
        <RowLink title={s ? s[0] : "Check my medicines"} body={safety.data ? `${safety.data.counts.needs_attention} need attention · ${safety.data.counts.review} to review` : "Interactions, allergies and conditions"} onPress={() => nav.open("more", { name: "safety" })} right={s ? <Badge text={s[0]} tone={s[1]} /> : undefined} />

        <H2>Reminders</H2>
        <RowLink title={`Notifications${unread.data?.count ? ` (${unread.data.count} new)` : ""}`} onPress={() => nav.open("more", { name: "notifications" })} />
        <RowLink
          title="Reminder calls"
          body={callOn ? "On: this phone rings when a dose is due" : "Off: tap to turn on in Settings"}
          onPress={() => nav.open("more", { name: "settings" })}
          right={<Badge text={callOn ? "On" : "Off"} tone={callOn ? "green" : "grey"} />}
        />

        <H2>Quick actions</H2>
        <View style={styles.row}>
          <Btn title="Add medicine" small kind="secondary" onPress={() => nav.open("meds", { name: "addMedicine" })} />
          <Btn title="Ask AI" small kind="secondary" onPress={() => nav.switchTab("ask")} />
          <Btn title="Emergency" small kind="danger" onPress={() => nav.open("more", { name: "emergency" })} />
        </View>
      </Screen>
    </Page>
  );
}
