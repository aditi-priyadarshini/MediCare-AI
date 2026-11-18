import React, { useState } from "react";
import { View } from "react-native";
import { api, errorTextOf } from "../api";
import { APP_VERSION, getBaseUrl, hasFirebase, setBaseUrl } from "../config";
import { getPushStatus } from "../calls/incomingCall";
import { TopBar } from "../nav";
import { useTheme } from "../prefs";
import { useSession } from "../session";
import { Badge, Btn, Card, ErrorNote, Field, H2, P, Page, Screen, styles, ToggleRow, useLoad } from "../ui";
import type { ConsentType } from "../types";

export function Settings() {
  const { largeText, highContrast, set } = useTheme();
  const { startCall, signOut } = useSession();
  const consents = useLoad(() => api.consents(), []);
  const devices = useLoad(() => api.devices(), []);
  const server = useLoad(() => getBaseUrl(), []);
  const [serverEdit, setServerEdit] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const push = getPushStatus();

  const on = (t: ConsentType) => consents.data?.find((c) => c.consent_type === t)?.granted ?? false;
  async function toggle(t: ConsentType, v: boolean) {
    setErr(null);
    try {
      await api.setConsent(t, v);
      await consents.reload();
    } catch (e) {
      setErr(errorTextOf(e));
    }
  }
  async function test(kind: "direct" | "push") {
    setBusy(kind);
    setErr(null);
    setNote(null);
    try {
      const call = await api.devTestCall(kind, kind === "push" ? 15 : 0);
      if (kind === "direct") startCall(call.id);
      else setNote("A push will be sent in 15 seconds. Lock the phone or close the app now and wait for it to ring.");
    } catch (e) {
      setErr(errorTextOf(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Page>
      <TopBar title="Settings" />
      <Screen>
        <H2>Reminder calls</H2>
        <Card>
          <ToggleRow title="Ring my phone when a dose is due" body="The phone rings like an incoming call and reads the reminder. You still tap “I took it” yourself." value={on("reminder_call")} onChange={(v) => void toggle("reminder_call", v)} />
          <View style={styles.row}>
            <Badge text={push.status === "registered" ? "This phone can be woken" : push.status === "unavailable" ? "Push not in this build" : "Push problem"} tone={push.status === "registered" ? "green" : "amber"} />
            <Badge text={`${devices.data?.length ?? 0} phone(s) registered`} tone="grey" />
          </View>
          {push.detail ? <P soft small>{push.detail}</P> : null}
          <P soft small>Do Not Disturb and silent mode are decided by your phone. Some phones also need “Battery: unrestricted” for this app.</P>
        </Card>

        <H2>Try it (development servers only)</H2>
        <Card tone="lavender">
          <P>Test call (no push): rings inside the app and uses the real WebRTC audio path.</P>
          <Btn title="Test call (no push)" busy={busy === "direct"} onPress={() => void test("direct")} />
          <P>Test push: the server sends a real push in 15 seconds so you can lock the phone first.</P>
          <Btn title="Ring me in 15 seconds (push)" kind="secondary" busy={busy === "push"} disabled={!hasFirebase} onPress={() => void test("push")} />
          {!hasFirebase ? <P soft small>Needs a build that includes google-services.json.</P> : null}
          {note ? <P>{note}</P> : null}
        </Card>

        <H2>Privacy</H2>
        <Card>
          <ToggleRow title="Let the AI use my records" value={on("ai_context")} onChange={(v) => void toggle("ai_context", v)} />
          <ToggleRow title="Email me reminders" value={on("reminder_email")} onChange={(v) => void toggle("reminder_email", v)} />
        </Card>

        <H2>Display</H2>
        <Card>
          <ToggleRow title="Larger text" value={largeText} onChange={(v) => set({ largeText: v })} />
          <ToggleRow title="High contrast" value={highContrast} onChange={(v) => set({ highContrast: v })} />
        </Card>

        <H2>Server</H2>
        <Card>
          <Field label="Server address" value={serverEdit ?? server.data ?? ""} onChangeText={setServerEdit} autoCapitalize="none" autoCorrect={false} />
          {serverEdit !== null ? <Btn title="Save address" small kind="secondary" onPress={async () => { await setBaseUrl(serverEdit); setNote("Saved. Sign out and in again to use it."); setServerEdit(null); await server.reload(); }} /> : null}
          <P soft small>App version {APP_VERSION}</P>
        </Card>

        {err ? <ErrorNote message={err} /> : null}
        <Btn title="Sign out" kind="danger" onPress={() => void signOut()} />
      </Screen>
    </Page>
  );
}
