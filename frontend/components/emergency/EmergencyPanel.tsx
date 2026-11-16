"use client";

import { ExternalLink, LocateFixed, Phone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Button, Card, CheckboxField, EmptyState, PageLoading, VerificationBadge } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { osmLink } from "@/lib/care";
import { cn } from "@/lib/cn";
import {
  CALL_HREF,
  EMERGENCY_NUMBER,
  FLOW,
  SETTING_ROWS,
  STEP_LABEL,
  coordsText,
  telFor,
  type Dispatch,
  type EmergencySettings,
  type EmergencyStatus,
  type EmergencySummary,
  type Simulation,
} from "@/lib/emergency";
import { useAsync } from "@/lib/hooks";
import type { EmergencyContact, Page } from "@/lib/types";

type Coords = { lat: number; lon: number; accuracy: number };

/* ------------------------------------------------------------ always available */
function CallCard() {
  return (
    <section aria-labelledby="call-h" className="rounded-card border-2 border-danger-700 bg-danger-100 p-5">
      <h2 id="call-h" className="text-xl font-bold text-danger-700">
        In an emergency, call {EMERGENCY_NUMBER} now
      </h2>
      <a
        href={CALL_HREF}
        className="mt-3 inline-flex min-h-[56px] items-center gap-2 rounded-lg bg-danger-700 px-6 text-lg font-bold text-white"
      >
        <Phone className="h-6 w-6" aria-hidden /> Call {EMERGENCY_NUMBER}
      </a>
      <p className="mt-3 text-sm text-ink">
        This app cannot place the call for you, contact anyone, or send an ambulance. Tell the operator where you are and
        what has happened. Do not wait for anything on this page.
      </p>
    </section>
  );
}

function LocationCard() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function ask() {
    if (!("geolocation" in navigator)) return setProblem("This browser cannot share your location. Tell the operator your address or a landmark.");
    setBusy(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        setCoords({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      (err) => {
        setBusy(false);
        setProblem(
          err.code === err.PERMISSION_DENIED
            ? "Location is turned off for this site. Tell the operator your address or a landmark."
            : "Could not find your location. Tell the operator your address or a landmark.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <Card aria-labelledby="loc-h" className="space-y-3">
      <h2 id="loc-h" className="text-lg font-semibold text-ink">
        Where you are
      </h2>
      <p className="text-sm text-ink-soft">
        Only when you press the button, your browser asks permission and shows your position here. It stays on this screen and
        is not saved or sent anywhere.
      </p>
      <Button variant="secondary" onClick={ask} loading={busy}>
        <LocateFixed className="h-4 w-4" aria-hidden /> Show my position
      </Button>
      {coords && (
        <div role="status" className="space-y-1 text-sm">
          <p className="font-mono text-base text-ink">{coordsText(coords.lat, coords.lon)}</p>
          <p className="text-ink-soft">Accurate to about {Math.round(coords.accuracy)} metres. You can read this out to the operator.</p>
          <a href={osmLink(coords.lat, coords.lon)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 font-medium text-teal-700 underline">
            <ExternalLink className="h-4 w-4" aria-hidden /> Show on OpenStreetMap
          </a>
        </div>
      )}
      {problem && (
        <p role="status" className="text-sm text-danger-700">
          {problem}
        </p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ signed in */
function ContactsCard() {
  const list = useAsync(() => api<Page<EmergencyContact>>("/emergency/contacts"), []);
  return (
    <Card aria-labelledby="contacts-h" className="space-y-3">
      <h2 id="contacts-h" className="text-lg font-semibold text-ink">
        People to call
      </h2>
      {list.loading && !list.data ? (
        <p className="text-sm text-ink-soft">Loading…</p>
      ) : !list.data ? (
        <p className="text-sm text-danger-700">Could not load your contacts.</p>
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No emergency contacts yet">
          Add someone on <Link href="/profile" className="underline">My Health</Link>.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {list.data.items.map((c) => {
            const tel = telFor(c.phone_e164);
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium text-ink">{c.name}</span>
                  {c.relationship ? <span className="text-ink-soft">, {c.relationship}</span> : null}
                  {c.is_primary ? <span className="ml-2 text-xs font-semibold text-teal-700">Primary</span> : null}
                </span>
                {tel && (
                  <a href={tel} className="inline-flex min-h-[44px] items-center gap-1.5 font-medium text-teal-700 underline">
                    <Phone className="h-4 w-4" aria-hidden /> {c.phone_e164}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function SummaryCard() {
  const settings = useAsync(() => api<EmergencySettings>("/emergency/settings"), []);
  const [draft, setDraft] = useState<EmergencySettings | null>(null);
  const [summary, setSummary] = useState<EmergencySummary | null>(null);
  const [busy, setBusy] = useState<"save" | "show" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  async function save() {
    if (!draft) return;
    setBusy("save");
    setFailure(null);
    try {
      await api("/emergency/settings", { method: "PUT", body: draft });
      await settings.reload();
      setSummary(null);
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function show() {
    setBusy("show");
    setFailure(null);
    try {
      setSummary(await api<EmergencySummary>("/emergency/summary"));
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const changed = draft && settings.data && JSON.stringify(draft) !== JSON.stringify(settings.data);
  return (
    <Card aria-labelledby="sum-h" className="space-y-4">
      <div>
        <h2 id="sum-h" className="text-lg font-semibold text-ink">
          Emergency summary
        </h2>
        <p className="text-sm text-ink-soft">
          A short page you can show a responder. You choose what is on it. Nothing is sent to anyone.
        </p>
      </div>
      {!draft ? (
        <p className="text-sm text-ink-soft">Loading…</p>
      ) : (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-ink">Include</legend>
          {SETTING_ROWS.map((r) => (
            <CheckboxField key={r.key} label={r.label} description={r.hint} checked={draft[r.key]} onChange={(e) => setDraft({ ...draft, [r.key]: e.target.checked })} />
          ))}
          {changed && (
            <Button variant="secondary" onClick={() => void save()} loading={busy === "save"}>
              Save choices
            </Button>
          )}
        </fieldset>
      )}
      <Button onClick={() => void show()} loading={busy === "show"} disabled={Boolean(changed)}>
        Show my emergency summary
      </Button>
      {changed && <p className="text-xs text-ink-soft">Save your choices first.</p>}
      {failure && (
        <Alert tone="danger" title="Not loaded">
          {failure}
        </Alert>
      )}
      {summary && (
        <div className="space-y-3 rounded-lg border-2 border-ink p-4" aria-live="polite">
          <p className="text-xl font-bold text-ink">{summary.display_name}</p>
          {summary.blood_group && (
            <p className="flex flex-wrap items-center gap-2 text-base text-ink">
              Blood group <strong>{summary.blood_group}</strong>
              {summary.blood_group_verification_status && <VerificationBadge status={summary.blood_group_verification_status} />}
            </p>
          )}
          {summary.allergies && (
            <div>
              <p className="text-sm font-semibold uppercase text-ink-soft">Allergies</p>
              {summary.allergies.length === 0 ? (
                <p className="text-sm text-ink-soft">None recorded.</p>
              ) : (
                <ul className="space-y-0.5 text-base">
                  {summary.allergies.map((a, i) => (
                    <li key={i}>
                      <strong>{a.substance}</strong>
                      {a.reaction ? `: ${a.reaction}` : ""}
                      {a.severity ? ` (${a.severity})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {summary.conditions && (
            <div>
              <p className="text-sm font-semibold uppercase text-ink-soft">Conditions</p>
              <p className="text-base">{summary.conditions.length ? summary.conditions.map((c) => c.display_name).join(", ") : "None recorded."}</p>
            </div>
          )}
          {summary.medications && (
            <div>
              <p className="text-sm font-semibold uppercase text-ink-soft">Medicines listed</p>
              <p className="text-base">
                {summary.medications.length
                  ? summary.medications.map((m) => [m.display_name, m.strength_text, m.dose_text].filter(Boolean).join(" ")).join("; ")
                  : "None recorded."}
              </p>
            </div>
          )}
          {summary.contacts && (
            <div>
              <p className="text-sm font-semibold uppercase text-ink-soft">Contacts</p>
              {summary.contacts.length === 0 ? (
                <p className="text-sm text-ink-soft">None recorded.</p>
              ) : (
                <ul className="text-base">
                  {summary.contacts.map((c, i) => (
                    <li key={i}>
                      {c.name}
                      {c.relationship ? ` (${c.relationship})` : ""}: {c.phone_e164}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-soft">
            {summary.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function PracticeCard() {
  const list = useAsync(() => api<Simulation[]>("/emergency/simulations"), []);
  const [confirm, setConfirm] = useState(false);
  const [understand, setUnderstand] = useState(false);
  const [shareLocation, setShareLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const current = list.data?.find((s) => s.is_open) ?? list.data?.[0] ?? null;

  async function run(path: string, body?: unknown) {
    setBusy(true);
    setFailure(null);
    try {
      await api(path, { method: "POST", body });
      await list.reload();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="prac-h" className="space-y-4 border-2 border-amber-600">
      <div>
        <p className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-600">Simulation</p>
        <h2 id="prac-h" className="mt-1 text-lg font-semibold text-ink">
          Practice the ambulance flow
        </h2>
        <p className="text-sm text-ink">
          <strong>No ambulance is contacted or sent.</strong> This only shows what the steps would look like. In a real emergency
          call {EMERGENCY_NUMBER}.
        </p>
      </div>

      {current && (
        <div className="space-y-3 rounded-lg bg-amber-100 p-4" aria-live="polite">
          <p className="text-sm font-bold text-amber-600">SIMULATION ONLY. {current.notice}</p>
          <ol className="space-y-1 text-sm">
            {FLOW.map((step) => {
              const done = current.history.some((h) => h.status === step);
              return (
                <li key={step} className={cn("flex items-center gap-2", done ? "font-semibold text-ink" : "text-ink-soft")}>
                  <span aria-hidden>{done ? "●" : "○"}</span>
                  {STEP_LABEL[step]}
                  {!done && <span className="sr-only"> (not reached)</span>}
                </li>
              );
            })}
          </ol>
          {current.status === "cancelled" && <p className="text-sm font-medium">{STEP_LABEL.cancelled}.</p>}
          {current.is_open && current.next_status && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" loading={busy} onClick={() => void run(`/emergency/simulations/${current.id}/advance`)}>
                Practice: move to “{STEP_LABEL[current.next_status]}”
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void run(`/emergency/simulations/${current.id}/cancel`)}>
                Cancel practice
              </Button>
            </div>
          )}
        </div>
      )}

      {!current?.is_open && (
        <div className="space-y-3">
          <CheckboxField checked={understand} onChange={(e) => setUnderstand(e.target.checked)} label="I understand this is a simulation and no ambulance will be sent." />
          <CheckboxField checked={confirm} onChange={(e) => setConfirm(e.target.checked)} label="Start a practice run." />
          <CheckboxField checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} label="Include location in the practice run." description="Only your choice is recorded. Your position is never saved." />
          <Button
            variant="secondary"
            loading={busy}
            disabled={!confirm || !understand}
            onClick={() =>
              void run("/emergency/simulations", { share_location: shareLocation, confirm: true, understand_simulation: true }).then(() => {
                setConfirm(false);
                setUnderstand(false);
              })
            }
          >
            Start practice run
          </Button>
        </div>
      )}
      {failure && (
        <Alert tone="danger" title="Not done">
          {failure}
        </Alert>
      )}
    </Card>
  );
}

function DispatchCard() {
  const status = useAsync(() => api<EmergencyStatus>("/emergency/status"), []);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<Dispatch | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function request() {
    if (!("geolocation" in navigator)) return setFailure("Your location is needed to request an ambulance. Call 112.");
    setBusy(true);
    setFailure(null);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          setResult(await api<Dispatch>("/emergency/dispatch-requests", { method: "POST", body: { latitude: p.coords.latitude, longitude: p.coords.longitude, confirm: true } }));
        } catch (e) {
          setFailure(errorMessage(e));
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        setFailure("Your location is needed to request an ambulance, and it was not shared. Call 112.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  if (!status.data) return null;
  return (
    <Card aria-labelledby="disp-h" className="space-y-3">
      <h2 id="disp-h" className="text-lg font-semibold text-ink">
        Request an ambulance through this app
      </h2>
      {!status.data.dispatch_available ? (
        <Alert tone="warning" title="Not available">
          No ambulance service is connected to this app, so it cannot request one. Call {EMERGENCY_NUMBER}.
        </Alert>
      ) : result ? (
        <Alert tone="success" title="A provider accepted the request">
          Reference {result.provider_reference}. {result.notice}
        </Alert>
      ) : (
        <>
          <p className="text-sm text-ink-soft">Your current position is sent to the ambulance service. Nothing else is sent.</p>
          <CheckboxField checked={confirm} onChange={(e) => setConfirm(e.target.checked)} label="Send my position and request an ambulance." />
          <Button variant="danger" disabled={!confirm} loading={busy} onClick={request}>
            Request ambulance
          </Button>
          {failure && (
            <Alert tone="danger" title="Not requested">
              {failure} Call {EMERGENCY_NUMBER} now.
            </Alert>
          )}
        </>
      )}
    </Card>
  );
}

export function EmergencyPanel() {
  const { status } = useAuth();
  return (
    <div className="space-y-5">
      <CallCard />
      <LocationCard />
      {status === "loading" && <PageLoading label="Checking sign-in" />}
      {status === "anonymous" && (
        <Alert tone="info" title="Sign in for your own details">
          Sign in to see your emergency contacts and summary here. Calling {EMERGENCY_NUMBER} never needs an account.{" "}
          <Link href="/login" className="font-semibold underline">
            Sign in
          </Link>
        </Alert>
      )}
      {status === "authenticated" && (
        <>
          <ContactsCard />
          <SummaryCard />
          <DispatchCard />
          <PracticeCard />
        </>
      )}
    </div>
  );
}
