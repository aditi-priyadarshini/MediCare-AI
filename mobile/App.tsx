import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { api, setSignedOutHandler } from "./src/api";
import { CallScreen } from "./src/calls/CallScreen";
import { dismissIncoming, setupIncomingCalls } from "./src/calls/incomingCall";
import { NavProvider, TabBar, useNav } from "./src/nav";
import { PrefsProvider, useTheme } from "./src/prefs";
import { Assistant, Chat } from "./src/screens/Assistant";
import { Care, Emergency, Notifications, Profile, Safety, Share } from "./src/screens/Health";
import { Home } from "./src/screens/Home";
import { Login } from "./src/screens/Login";
import { AddMedicine, MedicineDetail, Medicines } from "./src/screens/Medicines";
import { More } from "./src/screens/More";
import { LabDetail, RecordDetail, Records } from "./src/screens/Records";
import { Settings } from "./src/screens/Settings";
import { SessionContext } from "./src/session";
import type { AuthState } from "./src/types";
import { Loading } from "./src/ui";

function Routes() {
  const { tab, route } = useNav();
  switch (route.name) {
    case "medicine": return <MedicineDetail id={route.id} />;
    case "addMedicine": return <AddMedicine />;
    case "chat": return <Chat id={route.id} />;
    case "lab": return <LabDetail test={route.test} />;
    case "record": return <RecordDetail id={route.id} />;
    case "notifications": return <Notifications />;
    case "profile": return <Profile />;
    case "safety": return <Safety />;
    case "care": return <Care />;
    case "emergency": return <Emergency />;
    case "share": return <Share />;
    case "settings": return <Settings />;
    default:
      return tab === "home" ? <Home /> : tab === "meds" ? <Medicines /> : tab === "ask" ? <Assistant /> : tab === "records" ? <Records /> : <More />;
  }
}

function Root() {
  const { c } = useTheme();
  const [user, setUser] = useState<AuthState["user"] | null | undefined>(undefined);
  const [callId, setCallId] = useState<string | null>(null);

  const refreshUser = useCallback(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);
  useEffect(() => {
    setSignedOutHandler(() => setUser(null));
    refreshUser();
    return () => setSignedOutHandler(null);
  }, [refreshUser]);

  // Register this phone and listen for rings once signed in.
  useEffect(() => {
    if (!user) return;
    let off: (() => void) | undefined;
    void setupIncomingCalls({
      onAnswer: (id) => setCallId(id),
      onDecline: (id) => {
        void api.declineCall(id).catch(() => {});
        void dismissIncoming(id);
      },
    }).then((u) => (off = u));
    return () => off?.();
  }, [user]);

  const signOut = useCallback(async () => {
    await api.forgetDevice();
    await api.logout().catch(() => {});
    api.forgetSession();
    setCallId(null);
    setUser(null);
  }, []);

  const session = useMemo(() => (user ? { user, startCall: setCallId, signOut } : null), [user, signOut]);

  let body: React.ReactNode;
  if (user === undefined) body = <View style={{ flex: 1, justifyContent: "center", backgroundColor: c.canvas }}><Loading /></View>;
  else if (user === null || !session) body = <Login onSignedIn={refreshUser} />;
  else if (callId) body = <SessionContext.Provider value={session}><CallScreen callId={callId} onDone={() => setCallId(null)} /></SessionContext.Provider>;
  else
    body = (
      <SessionContext.Provider value={session}>
        <NavProvider>
          <View style={{ flex: 1, backgroundColor: c.canvas }}>
            <View style={{ flex: 1 }}><Routes /></View>
            <TabBar />
          </View>
        </NavProvider>
      </SessionContext.Provider>
    );
  return <>{body}<StatusBar style="dark" /></>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <Root />
      </PrefsProvider>
    </SafeAreaProvider>
  );
}
