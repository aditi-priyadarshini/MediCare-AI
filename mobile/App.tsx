import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { api } from "./src/api";
import { CallScreen } from "./src/CallScreen";
import { LoginScreen } from "./src/LoginScreen";
import { dismissIncoming, setupIncomingCalls } from "./src/incomingCall";

type Auth = "checking" | "out" | "in";

export default function App() {
  const [auth, setAuth] = useState<Auth>("checking");
  const [callId, setCallId] = useState<string | null>(null);

  useEffect(() => {
    api.me().then(() => setAuth("in")).catch(() => setAuth("out"));
  }, []);

  // Register this phone and start listening for rings once signed in.
  useEffect(() => {
    if (auth !== "in") return;
    let off: (() => void) | undefined;
    void setupIncomingCalls({
      onAnswer: (id) => setCallId(id),
      onDecline: (id) => {
        void api.declineCall(id).catch(() => {});
        void dismissIncoming(id);
      },
    }).then((u) => (off = u));
    return () => off?.();
  }, [auth]);

  const signOut = useCallback(async () => {
    await api.forgetDevice();
    await api.logout().catch(() => {});
    setAuth("out");
  }, []);

  if (auth === "checking") return <View style={s.center}><ActivityIndicator size="large" /></View>;
  if (auth === "out") return <SafeAreaView style={s.flex}><LoginScreen onSignedIn={() => setAuth("in")} /></SafeAreaView>;
  if (callId) return <SafeAreaView style={s.flex}><CallScreen callId={callId} onDone={() => setCallId(null)} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.flex}>
      <View style={s.center}>
        <Text style={s.title}>You are set up for reminder calls</Text>
        <Text style={s.body}>
          When a dose is due, this phone will ring like an incoming call. Make sure “Ring my phone
          when a dose is due” is switched on in Settings on the website.
        </Text>
        <Pressable style={s.btn} onPress={() => void signOut()} accessibilityRole="button">
          <Text style={s.btnText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#F4FBFA" },
  center: { flex: 1, padding: 24, justifyContent: "center", gap: 16 },
  title: { fontSize: 26, fontWeight: "700", color: "#0B2B3B" },
  body: { fontSize: 18, color: "#35605D" },
  btn: { padding: 16, borderRadius: 14, backgroundColor: "#DCEFEE", alignItems: "center" },
  btnText: { fontSize: 18, fontWeight: "600", color: "#0B2B3B" },
});
