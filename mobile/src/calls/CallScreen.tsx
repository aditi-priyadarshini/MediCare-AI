import * as Speech from "expo-speech";
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import InCallManager from "react-native-incall-manager";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, errorTextOf } from "../api";
import { useTheme } from "../prefs";
import type { Accept } from "../types";
import { Badge, Btn, Card, H1, Loading, P } from "../ui";
import { startSession, Session } from "./callSession";
import { dismissIncoming } from "./incomingCall";

type Phase = "connecting" | "live" | "fallback" | "error";

/**
 * The call screen. The medicine is shown only here, after the patient answered. A call never
 * marks a dose: "I took it" is the patient's own tap and goes through the ordinary dose API.
 */
export function CallScreen({ callId, onDone }: { callId: string; onDone: () => void }) {
  const { c } = useTheme();
  const [phase, setPhase] = useState<Phase>("connecting");
  const [info, setInfo] = useState<Accept | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef<Session | null>(null);
  const spoke = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const speakFallback = (text: string, reason: string) => {
      if (spoke.current) return;
      spoke.current = true;
      setWhy(reason);
      setPhase("fallback");
      Speech.speak(text);
    };
    (async () => {
      try {
        const accept = await api.acceptCall(callId);
        if (cancelled) return;
        setInfo(accept);
        await dismissIncoming(callId);
        InCallManager.start({ media: "audio" });
        InCallManager.setForceSpeakerphoneOn(true); // hands free, easier to hear
        session.current = await startSession(accept, {
          onConnected: () => setPhase((p) => (p === "fallback" ? p : "live")),
          onFallbackNeeded: (r) => speakFallback(accept.dose.spoken_text, r),
        });
      } catch (e) {
        if (cancelled) return;
        setError(errorTextOf(e));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      session.current?.hangUp();
      Speech.stop();
      try {
        InCallManager.stop();
      } catch {
        /* not started */
      }
    };
  }, [callId]);

  async function finish(action?: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      if (action) await action();
    } catch (e) {
      setError(errorTextOf(e));
      setBusy(false);
      return;
    }
    await api.endCall(callId).catch(() => {});
    onDone();
  }

  const label = phase === "live" ? "Reminder call · server voice" : phase === "fallback" ? "Reading your reminder aloud" : phase === "error" ? "Call problem" : "Connecting…";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 14 }}>
        {phase === "error" ? (
          <>
            <H1>This reminder call could not start</H1>
            <P>{error}</P>
            <Btn title="Close" onPress={onDone} />
          </>
        ) : !info ? (
          <Loading />
        ) : (
          <>
            <Badge text={label} tone={phase === "live" ? "green" : phase === "fallback" ? "amber" : "blue"} />
            <H1>{info.dose.medication_name}</H1>
            {info.dose.dose_text ? <P>{info.dose.dose_text}</P> : null}
            {phase === "fallback" && why ? <P soft small>Server audio was not used ({why}).</P> : null}
            {error ? <Card tone="red"><P>{error}</P></Card> : null}
            <Btn title="I took it" busy={busy} onPress={() => void finish(() => api.takeDose(info.dose.dose_id))} />
            <Btn title="Not now" kind="secondary" disabled={busy} onPress={() => void finish()} />
            <Btn title="Skip this dose" kind="ghost" disabled={busy} onPress={() => void finish(() => api.skipDose(info.dose.dose_id))} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
