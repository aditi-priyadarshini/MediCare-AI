import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { api, errorTextOf } from "../api";
import { TopBar, useNav } from "../nav";
import { useTheme } from "../prefs";
import type { ChatMessage } from "../types";
import { Badge, Btn, Card, Empty, ErrorNote, fmtDate, H1, Loading, P, Page, RowLink, Screen, styles, useLoad } from "../ui";

export function Assistant() {
  const nav = useNav();
  const list = useLoad(() => api.sessions(), []);
  const status = useLoad(() => api.assistantStatus(), []);
  return (
    <Page>
      <Screen onRefresh={list.reload} refreshing={list.loading}>
        <H1>Ask AI</H1>
        <Card tone="lavender">
          <P>{status.data?.mode === "llm" ? "AI answers, based on your records only if you allow it." : "Evidence-only mode: it lists matching records without an AI model."}</P>
          {status.data?.notices.map((n, i) => <P key={i} soft small>{n}</P>)}
          <P soft small>This is not a doctor. For emergencies call 112.</P>
        </Card>
        <Btn title="New chat" onPress={() => nav.go({ name: "chat", id: null })} />
        {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
        {list.loading && !list.data ? <Loading /> : null}
        {list.data && list.data.items.length === 0 ? <Empty title="No chats yet" /> : null}
        {list.data?.items.map((s) => <RowLink key={s.id} title={s.title} body={fmtDate(s.updated_at)} onPress={() => nav.go({ name: "chat", id: s.id })} />)}
      </Screen>
    </Page>
  );
}

export function Chat({ id }: { id: string | null }) {
  const { c, fs } = useTheme();
  const [sid, setSid] = useState<string | null>(id);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!id);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (!id) return;
    api.session(id).then((d) => setMsgs(d.messages)).catch((e) => setErr(errorTextOf(e))).finally(() => setLoading(false));
  }, [id]);

  async function send() {
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    setErr(null);
    try {
      let useId = sid;
      if (!useId) {
        const created = await api.createSession();
        useId = created.id;
        setSid(useId);
      }
      const r = await api.ask(useId, content);
      setMsgs((m) => [...m, r.user_message, r.assistant_message]);
      setText("");
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      setErr(errorTextOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <TopBar title="Chat" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
          {loading ? <Loading /> : null}
          {!loading && msgs.length === 0 ? <P soft>Ask about your medicines, results or how to use the app.</P> : null}
          {msgs.map((m) => (
            <View key={m.id} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
              <Card tone={m.role === "user" ? "mint" : undefined}>
                <P>{m.content}</P>
                {m.role === "assistant" ? (
                  <View style={styles.row}>
                    {m.safety_classification === "urgent_escalation" ? <Badge text="Urgent: get help now" tone="red" /> : null}
                    {m.mode === "evidence_only" ? <Badge text="From your records" tone="lavender" /> : null}
                    {m.evidence.length ? <Badge text={`${m.evidence.length} source${m.evidence.length > 1 ? "s" : ""}`} tone="grey" /> : null}
                  </View>
                ) : null}
              </Card>
            </View>
          ))}
          {err ? <ErrorNote message={err} /> : null}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface, alignItems: "flex-end" }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type your question"
            placeholderTextColor={c.inkSoft}
            multiline
            maxLength={2000}
            accessibilityLabel="Your question"
            style={{ flex: 1, minHeight: 48, maxHeight: 120, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(16), color: c.ink }}
          />
          <Btn title="Send" busy={busy} disabled={!text.trim()} onPress={() => void send()} />
        </View>
      </KeyboardAvoidingView>
    </Page>
  );
}
