import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import InCallManager from "react-native-incall-manager";
import * as Speech from "expo-speech";
import { Accept, api } from "./api";
import { startSession, Session } from "./callSession";
import { dismissIncoming } from "./incomingCall";

type Phase = "connecting" | "live" | "fallback" | "ended" | "error";

/**
 * The call screen. The medicine is shown only here, after the patient answered. A call never
 * marks a dose: "I took it" is the patient's own tap and goes through the ordinary dose API.
 */
export function CallScreen({ callId, onDone }: { callId: string; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [info, setInfo] = useState<Accept | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const spoke = useRef(false);

  const speakFallback = (text: string) => {
    if (spoke.current) return;
    spoke.current = true;
    setPhase("fallback");
    Speech.speak(text);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const accept = await api.acceptCall(callId);
        if (cancelled) return;
        setInfo(accept);
        await dismissIncoming(callId);
        InCallManager.start({ media: "audio" });
        InCallManager.setForceSpeakerphoneOn(true); // easier to hear, hands free
        session.current = await startSession(accept, {
          onConnected: () => setPhase((p) => (p === "fallback" ? p : "live")),
          onFallbackNeeded: () => speakFallback(accept.dose.spoken_text),
          onClosed: () => {},
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "The call could not start.");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      session.current?.hangUp();
      Speech.stop();
      InCallManager.stop();
    };
  }, [callId]);

  async function finish(action?: () => Promise<unknown>) {
    try {
      if (action) await action();
      await api.endCall(callId).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save. Please try again.");
      return;
    }
    session.current?.hangUp();
    Speech.stop();
    setPhase("ended");
    onDone();
  }

  if (phase === "error") {
    return (
      <View style={s.wrap}>
        <Text style={s.title}>This reminder call could not start</Text>
        <Text style={s.body}>{error}</Text>
        <Pressable style={s.btn} onPress={onDone}><Text style={s.btnText}>Close</Text></Pressable>
      </View>
    );
  }
  if (!info) {
    return <View style={s.wrap}><ActivityIndicator size="large" /></View>;
  }
  return (
    <View style={s.wrap}>
      <Text style={s.small}>{phase === "live" ? "Reminder call" : phase === "fallback" ? "Reading your reminder" : "Connecting…"}</Text>
      <Text style={s.title}>{info.dose.medication_name}</Text>
      {info.dose.dose_text ? <Text style={s.body}>{info.dose.dose_text}</Text> : null}
      {error ? <Text style={s.err}>{error}</Text> : null}
      <Pressable style={[s.btn, s.primary]} onPress={() => void finish(() => api.takeDose(info.dose.dose_id))} accessibilityRole="button">
        <Text style={[s.btnText, s.primaryText]}>I took it</Text>
      </Pressable>
      <Pressable style={s.btn} onPress={() => void finish()} accessibilityRole="button">
        <Text style={s.btnText}>Not now</Text>
      </Pressable>
      <Pressable style={s.btn} onPress={() => void finish(() => api.skipDose(info.dose.dose_id))} accessibilityRole="button">
        <Text style={s.btnText}>Skip this dose</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: "center", gap: 14, backgroundColor: "#F4FBFA" },
  small: { fontSize: 16, color: "#35605D" },
  title: { fontSize: 32, fontWeight: "700", color: "#0B2B3B" },
  body: { fontSize: 20, color: "#0B2B3B" },
  err: { fontSize: 16, color: "#B42318" },
  btn: { padding: 18, borderRadius: 14, backgroundColor: "#DCEFEE", alignItems: "center" },
  primary: { backgroundColor: "#157873" },
  primaryText: { color: "#FFFFFF" },
  btnText: { fontSize: 20, fontWeight: "600", color: "#0B2B3B" },
});
