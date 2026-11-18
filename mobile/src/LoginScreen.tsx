import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "./api";

export function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.login(email.trim(), password);
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.wrap}>
      <Text style={s.title}>MediCare AI</Text>
      <Text style={s.body}>Sign in with the same account you use on the website.</Text>
      <TextInput style={s.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
      <TextInput style={s.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} accessibilityLabel="Password" />
      {error ? <Text style={s.err}>{error}</Text> : null}
      <Pressable style={s.btn} onPress={() => void submit()} disabled={busy} accessibilityRole="button">
        <Text style={s.btnText}>{busy ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: "center", gap: 14, backgroundColor: "#F4FBFA" },
  title: { fontSize: 32, fontWeight: "700", color: "#0B2B3B" },
  body: { fontSize: 18, color: "#35605D" },
  input: { borderWidth: 1, borderColor: "#9BBFBC", borderRadius: 12, padding: 14, fontSize: 18, backgroundColor: "#fff" },
  err: { color: "#B42318", fontSize: 16 },
  btn: { padding: 18, borderRadius: 14, backgroundColor: "#157873", alignItems: "center" },
  btnText: { fontSize: 20, fontWeight: "600", color: "#fff" },
});
