import React, { useState } from "react";
import { View } from "react-native";
import { api } from "../api";
import { TopBar, useNav } from "../nav";
import { useTheme } from "../prefs";
import { Badge, Btn, Card, Empty, ErrorNote, fmtDate, H1, H2, Loading, P, Page, RowLink, Screen, styles, useLoad } from "../ui";

const TYPE_LABEL: Record<string, string> = {
  lab_report: "Lab report", prescription: "Prescription", imaging: "Imaging",
  discharge_summary: "Discharge summary", vaccination: "Vaccination", other: "Other",
};
const FLAG_TONE = { low: "amber", high: "red", normal: "green", unknown: "grey" } as const;

export function Records() {
  const nav = useNav();
  const [tab, setTab] = useState<"docs" | "labs">("docs");
  const recs = useLoad(() => api.records(), []);
  const labs = useLoad(() => api.labTests(), []);
  const cur = tab === "docs" ? recs : labs;
  return (
    <Page>
      <Screen onRefresh={cur.reload} refreshing={cur.loading}>
        <H1>Records</H1>
        <View style={styles.row}>
          <Btn title="Documents" small kind={tab === "docs" ? "primary" : "secondary"} onPress={() => setTab("docs")} />
          <Btn title="Lab results" small kind={tab === "labs" ? "primary" : "secondary"} onPress={() => setTab("labs")} />
        </View>
        {cur.error ? <ErrorNote message={cur.error} onRetry={cur.reload} /> : null}
        {cur.loading && !cur.data ? <Loading /> : null}
        {tab === "docs" ? (
          <>
            {recs.data && recs.data.items.length === 0 ? <Empty title="No documents yet" body="Upload or scan reports on the website." /> : null}
            {recs.data?.items.map((r) => (
              <RowLink key={r.id} title={r.title} body={[TYPE_LABEL[r.record_type] ?? r.record_type, fmtDate(r.record_date)].filter(Boolean).join(" · ")} onPress={() => nav.go({ name: "record", id: r.id })} />
            ))}
          </>
        ) : (
          <>
            {labs.data && labs.data.length === 0 ? <Empty title="No lab results yet" /> : null}
            {labs.data?.map((l) => (
              <RowLink
                key={l.test_name}
                title={l.test_name}
                body={`${l.latest_value_numeric ?? l.latest_value_text ?? "–"} ${l.latest_unit ?? ""} · ${fmtDate(l.latest_observed_on)}`}
                right={<Badge text={l.latest_flag} tone={FLAG_TONE[l.latest_flag]} />}
                onPress={() => nav.go({ name: "lab", test: l.test_name })}
              />
            ))}
          </>
        )}
        <P soft small>Uploading and scanning documents is available on the website.</P>
      </Screen>
    </Page>
  );
}

export function RecordDetail({ id }: { id: string }) {
  const list = useLoad(() => api.records(), []);
  const r = list.data?.items.find((x) => x.id === id);
  return (
    <Page>
      <TopBar title={r?.title ?? "Record"} />
      <Screen>
        {!r ? <Loading /> : (
          <Card>
            <View style={styles.row}><Badge text={TYPE_LABEL[r.record_type] ?? r.record_type} tone="blue" /><Badge text={r.verification_status.replace(/_/g, " ")} tone="grey" /></View>
            {r.record_date ? <P>Date: {fmtDate(r.record_date)}</P> : null}
            {r.provider_name ? <P>From: {r.provider_name}</P> : null}
            {r.notes ? <P>{r.notes}</P> : null}
            {r.has_file ? <P soft small>File: {r.file_name}. Open it on the website to view or download.</P> : null}
          </Card>
        )}
      </Screen>
    </Page>
  );
}

export function LabDetail({ test }: { test: string }) {
  const { c } = useTheme();
  const t = useLoad(() => api.labTrend(test), [test]);
  const pts = t.data?.points ?? [];
  const max = Math.max(1, ...pts.map((p) => p.value), t.data?.ref_high ?? 0);
  return (
    <Page>
      <TopBar title={test} />
      <Screen>
        {t.error ? <ErrorNote message={t.error} onRetry={t.reload} /> : null}
        {t.loading && !t.data ? <Loading /> : null}
        {t.data ? (
          <>
            <P soft>
              {t.data.ref_low !== null || t.data.ref_high !== null ? `Reference range: ${t.data.ref_low ?? "–"} to ${t.data.ref_high ?? "–"} ${t.data.unit ?? ""}` : "No reference range recorded."}
            </P>
            {pts.length === 0 ? <Empty title="No numeric results" /> : null}
            <Card>
              {pts.map((p) => (
                <View key={p.id} style={{ gap: 2 }}>
                  <View style={styles.row}>
                    <P small soft>{fmtDate(p.observed_on)}</P>
                    <H2>{`${p.value} ${t.data?.unit ?? ""}`}</H2>
                    <Badge text={p.flag} tone={FLAG_TONE[p.flag as keyof typeof FLAG_TONE] ?? "grey"} />
                  </View>
                  <View style={{ height: 10, backgroundColor: c.mint100, borderRadius: 5 }}>
                    <View style={{ height: 10, width: `${Math.max(2, (p.value / max) * 100)}%`, backgroundColor: p.flag === "high" ? c.red700 : p.flag === "low" ? c.amber600 : c.teal700, borderRadius: 5 }} />
                  </View>
                </View>
              ))}
            </Card>
            <P soft small>These are your recorded values. Ask your doctor what they mean for you.</P>
          </>
        ) : null}
      </Screen>
    </Page>
  );
}
