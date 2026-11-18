import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, errorTextOf } from "../api";
import { getBaseUrl, setBaseUrl } from "../config";
import { useTheme } from "../prefs";
import { Btn, Card, Field, P } from "../ui";

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const { c, fs } = useTheme();
  const [server, setServer] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getBaseUrl().then(setServer);
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await setBaseUrl(server);
      await api.login(email.trim(), password);
      onSignedIn();
    } catch (e) {
      setError(errorTextOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14, flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: fs(32), fontWeight: "800", color: c.brand900 }}>MediCare AI</Text>
          <P soft>Sign in with the same account you use on the website.</P>
        </View>
        <Field label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" hint="Emulator: http://10.0.2.2:8000. Real phone: http://<your PC's Wi-Fi address>:8000" />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="password" onSubmitEditing={() => void submit()} />
        {error ? <Card tone="red"><P>{error}</P></Card> : null}
        <Btn title="Sign in" busy={busy} disabled={!email || !password} onPress={() => void submit()} />
        <P soft small>New here, or forgot your password? Create the account or reset it on the website, then sign in here.</P>
      </ScrollView>
    </SafeAreaView>
  );
}
