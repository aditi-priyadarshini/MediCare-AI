import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "./api";
import { useTheme } from "./prefs";
import { radius, space } from "./theme";

// ------------------------------------------------------------------------------- data hook
/** Loads something once, exposes reload(), and turns errors into a readable message. */
export function useLoad<R>(fn: () => Promise<R>, deps: unknown[] = []) {
  const [data, setData] = useState<R | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fn();
      if (alive.current) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}

export const errorText = (e: unknown) =>
  e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.";

// ---------------------------------------------------------------------------------- layout
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  padded = true,
}: {
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  padded?: boolean;
}) {
  const { c } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.canvas }}
      contentContainerStyle={{ padding: padded ? space.lg : 0, gap: space.md, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.teal700} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children, style, tone }: { children: React.ReactNode; style?: ViewStyle; tone?: "mint" | "amber" | "red" | "lavender" | "blue" | "green" }) {
  const { c } = useTheme();
  const bg = tone === "mint" ? c.mint100 : tone === "amber" ? c.amber100 : tone === "red" ? c.red100 : tone === "lavender" ? c.lavender100 : tone === "blue" ? c.blue100 : tone === "green" ? c.success100 : c.surface;
  return (
    <View style={[{ backgroundColor: bg, borderColor: c.border, borderWidth: 1, borderRadius: radius.card, padding: space.lg, gap: space.sm }, style]}>
      {children}
    </View>
  );
}

// ------------------------------------------------------------------------------------ text
export function H1({ children }: { children: React.ReactNode }) {
  const { c, fs } = useTheme();
  return <Text accessibilityRole="header" style={{ fontSize: fs(24), lineHeight: fs(30), fontWeight: "700", color: c.ink }}>{children}</Text>;
}
export function H2({ children }: { children: React.ReactNode }) {
  const { c, fs } = useTheme();
  return <Text accessibilityRole="header" style={{ fontSize: fs(18), lineHeight: fs(24), fontWeight: "600", color: c.ink }}>{children}</Text>;
}
export function P({ children, soft, small, color }: { children: React.ReactNode; soft?: boolean; small?: boolean; color?: string }) {
  const { c, fs } = useTheme();
  return <Text style={{ fontSize: fs(small ? 13 : 16), lineHeight: fs(small ? 18 : 23), color: color ?? (soft ? c.inkSoft : c.ink) }}>{children}</Text>;
}

// --------------------------------------------------------------------------------- controls
export function Btn({
  title,
  onPress,
  kind = "primary",
  disabled,
  busy,
  small,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
}) {
  const { c, fs } = useTheme();
  const bg = kind === "primary" ? c.teal700 : kind === "danger" ? c.red700 : kind === "secondary" ? c.mint100 : "transparent";
  const fg = kind === "primary" || kind === "danger" ? "#fff" : c.teal700;
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => ({
        minHeight: small ? 40 : 48,
        paddingHorizontal: space.lg,
        borderRadius: radius.card,
        backgroundColor: bg,
        borderWidth: kind === "ghost" || kind === "secondary" ? 1 : 0,
        borderColor: c.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: off ? 0.55 : pressed ? 0.85 : 1,
        flexDirection: "row",
        gap: 8,
      })}
    >
      {busy ? <ActivityIndicator color={fg} /> : null}
      <Text style={{ color: fg, fontSize: fs(small ? 14 : 16), fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, ...rest }: { label: string; hint?: string } & TextInputProps) {
  const { c, fs } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: fs(14), fontWeight: "600", color: c.ink }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.inkSoft}
        style={{
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: radius.sm + 2,
          paddingHorizontal: 12,
          paddingVertical: 10,
          minHeight: 48,
          fontSize: fs(16),
          color: c.ink,
          backgroundColor: c.surface,
        }}
        {...rest}
      />
      {hint ? <Text style={{ fontSize: fs(12), color: c.inkSoft }}>{hint}</Text> : null}
    </View>
  );
}

export function ToggleRow({ title, body, value, onChange, disabled }: { title: string; body?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <P>{title}</P>
        {body ? <P soft small>{body}</P> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={title}
        trackColor={{ true: c.teal500, false: c.border }}
        thumbColor={value ? c.teal700 : "#f4f4f4"}
      />
    </View>
  );
}

export function Badge({ text, tone = "mint" }: { text: string; tone?: "mint" | "amber" | "red" | "blue" | "green" | "lavender" | "grey" }) {
  const { c, fs } = useTheme();
  const map = {
    mint: [c.mint100, c.teal700],
    amber: [c.amber100, c.amber600],
    red: [c.red100, c.red700],
    blue: [c.blue100, c.blue700],
    green: [c.success100, c.success700],
    lavender: [c.lavender100, c.lavender700],
    grey: [c.canvas, c.inkSoft],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: bg, borderColor: c.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
      <Text style={{ color: fg, fontSize: fs(12), fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

export function Loading() {
  const { c } = useTheme();
  return <ActivityIndicator style={{ marginVertical: 24 }} size="large" color={c.teal700} />;
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card tone="red">
      <P>{message}</P>
      {onRetry ? <Btn title="Try again" kind="secondary" small onPress={onRetry} /> : null}
    </Card>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <Card style={{ alignItems: "center" }}>
      <H2>{title}</H2>
      {body ? <P soft>{body}</P> : null}
    </Card>
  );
}

export function RowLink({ title, body, onPress, right }: { title: string; body?: string; onPress: () => void; right?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        backgroundColor: pressed ? c.mint100 : c.surface,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: radius.card,
        padding: space.lg,
        minHeight: 56,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <P>{title}</P>
        {body ? <P soft small>{body}</P> : null}
      </View>
      {right}
      <Text style={{ color: c.inkSoft, fontSize: 20 }}>›</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({ row: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" } });

export const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "";
