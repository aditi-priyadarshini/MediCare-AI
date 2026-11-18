/**
 * A deliberately tiny navigator (five tabs, each with a back stack) so the app has no
 * navigation library that could fail to build. Mirrors the website's mobile bar:
 * Home, Medicines, Ask AI, Records, More.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./prefs";

export type Tab = "home" | "meds" | "ask" | "records" | "more";
export type Route =
  | { name: "root" }
  | { name: "medicine"; id: string }
  | { name: "addMedicine" }
  | { name: "chat"; id: string | null }
  | { name: "lab"; test: string }
  | { name: "record"; id: string }
  | { name: "notifications" }
  | { name: "profile" }
  | { name: "safety" }
  | { name: "care" }
  | { name: "emergency" }
  | { name: "share" }
  | { name: "settings" }
  | { name: "about" };

interface Nav {
  tab: Tab;
  route: Route;
  go: (r: Route) => void;
  back: () => void;
  switchTab: (t: Tab) => void;
  /** Open a screen from anywhere: selects the tab it belongs to, then pushes it. */
  open: (t: Tab, r: Route) => void;
}
const NavContext = createContext<Nav | null>(null);
export const useNav = () => {
  const n = useContext(NavContext);
  if (!n) throw new Error("useNav outside NavProvider");
  return n;
};

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>("home");
  const [stacks, setStacks] = useState<Record<Tab, Route[]>>({
    home: [{ name: "root" }],
    meds: [{ name: "root" }],
    ask: [{ name: "root" }],
    records: [{ name: "root" }],
    more: [{ name: "root" }],
  });
  const route = stacks[tab][stacks[tab].length - 1];

  const go = useCallback((r: Route) => setStacks((s) => ({ ...s, [tab]: [...s[tab], r] })), [tab]);
  const back = useCallback(() => setStacks((s) => (s[tab].length > 1 ? { ...s, [tab]: s[tab].slice(0, -1) } : s)), [tab]);
  const switchTab = useCallback((t: Tab) => {
    setStacks((s) => ({ ...s, [t]: [{ name: "root" }] }));
    setTab(t);
  }, []);
  const open = useCallback((t: Tab, r: Route) => {
    setStacks((s) => ({ ...s, [t]: [{ name: "root" }, r] }));
    setTab(t);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stacks[tab].length > 1) {
        back();
        return true;
      }
      if (tab !== "home") {
        switchTab("home");
        return true;
      }
      return false; // let Android leave the app
    });
    return () => sub.remove();
  }, [stacks, tab, back, switchTab]);

  const value = useMemo(() => ({ tab, route, go, back, switchTab, open }), [tab, route, go, back, switchTab, open]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: "home", label: "Home", glyph: "⌂" },
  { id: "meds", label: "Medicines", glyph: "✚" },
  { id: "ask", label: "Ask AI", glyph: "✦" },
  { id: "records", label: "Records", glyph: "▤" },
  { id: "more", label: "More", glyph: "☰" },
];

export function TabBar() {
  const { tab, switchTab } = useNav();
  const { c, fs } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, paddingBottom: insets.bottom }}>
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t.label}
            onPress={() => switchTab(t.id)}
            style={{ flex: 1, alignItems: "center", paddingVertical: 8, minHeight: 56, justifyContent: "center" }}
          >
            <View style={{ backgroundColor: active ? c.mint100 : "transparent", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 2 }}>
              <Text style={{ fontSize: 20, color: active ? c.teal700 : c.inkSoft }}>{t.glyph}</Text>
            </View>
            <Text style={{ fontSize: fs(11), fontWeight: active ? "700" : "500", color: active ? c.teal700 : c.inkSoft }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Header with a back arrow, used by every pushed screen. */
export function TopBar({ title }: { title: string }) {
  const { back } = useNav();
  const { c, fs } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: c.canvas }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 28, color: c.teal700 }}>‹</Text>
      </Pressable>
      <Text numberOfLines={1} accessibilityRole="header" style={{ flex: 1, fontSize: fs(18), fontWeight: "700", color: c.ink }}>{title}</Text>
    </View>
  );
}
