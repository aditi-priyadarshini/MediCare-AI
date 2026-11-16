"use client";

import { ExternalLink, LocateFixed, Phone } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { distanceLabel, osmLink, telHref, type Freshness, type SourceBrief } from "@/lib/care";
import { cn } from "@/lib/cn";

export interface Coords {
  lat: number;
  lon: number;
}

/** Where the data came from and how old it is. Stale data is shown, with a plain warning. */
export function SourceLine({ source, freshness }: { source: SourceBrief; freshness: Freshness }) {
  return (
    <p className="text-xs text-ink-soft">
      Source: {source.url ? (
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">
          {source.name}
        </a>
      ) : (
        source.name
      )}
      {source.licence ? `, ${source.licence}` : ""}.{" "}
      <span className={cn(freshness.state === "stale" && "font-semibold text-amber-600")}>{freshness.label}</span>
    </p>
  );
}

/** Call link, an OpenStreetMap link-out, and distance. No map tiles are loaded by this app. */
export function PlaceActions({
  phone,
  latitude,
  longitude,
  distanceKm,
}: {
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
}) {
  const tel = telHref(phone);
  const dist = distanceLabel(distanceKm);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {tel && (
        <a href={tel} className="inline-flex min-h-[44px] items-center gap-1.5 font-medium text-teal-700 underline">
          <Phone className="h-4 w-4" aria-hidden /> Call {phone}
        </a>
      )}
      {latitude !== null && longitude !== null && (
        <a
          href={osmLink(latitude, longitude)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center gap-1.5 font-medium text-teal-700 underline"
        >
          <ExternalLink className="h-4 w-4" aria-hidden /> Show on OpenStreetMap
        </a>
      )}
      {dist && <span className="text-ink-soft">{dist}</span>}
    </div>
  );
}

/**
 * Asks the browser for the person's position when they press the button. The position lives in
 * this component's state for the current search only: it is not stored, saved or logged.
 */
export function LocationButton({
  coords,
  onChange,
}: {
  coords: Coords | null;
  onChange: (c: Coords | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function ask() {
    if (!("geolocation" in navigator)) {
      setProblem("This browser cannot share your location. Search by city instead.");
      return;
    }
    setBusy(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onChange({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => {
        setBusy(false);
        setProblem(
          err.code === err.PERMISSION_DENIED
            ? "Location is turned off for this site. You can search by city instead."
            : "Could not find your location. You can search by city instead.",
        );
      },
      { maximumAge: 60_000, timeout: 10_000 },
    );
  }

  return (
    <div className="space-y-1">
      {coords ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-soft">Sorting by distance from where you are.</span>
          <Button variant="ghost" onClick={() => onChange(null)}>
            Stop using my location
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={ask} loading={busy}>
          <LocateFixed className="h-4 w-4" aria-hidden /> Use my location
        </Button>
      )}
      <p className="text-xs text-ink-soft">
        Your location is used for this search only. It is not saved.
      </p>
      {problem && (
        <p role="status" className="text-sm text-danger-700">
          {problem}
        </p>
      )}
    </div>
  );
}

/** Previous / next for a paged result. Pages replace each other, so the labels say "page". */
export function Pager({
  result,
  onPage,
}: {
  result: { total: number; limit: number; offset: number; items: unknown[] };
  onPage: (offset: number) => void;
}) {
  const hasPrev = result.offset > 0;
  const hasNext = result.total > result.offset + result.items.length;
  if (!hasPrev && !hasNext) return null;
  const page = Math.floor(result.offset / result.limit) + 1;
  const pages = Math.max(1, Math.ceil(result.total / result.limit));
  return (
    <nav aria-label="Pages" className="flex items-center gap-3">
      <Button variant="secondary" disabled={!hasPrev} onClick={() => onPage(Math.max(0, result.offset - result.limit))}>
        Previous page
      </Button>
      <span className="text-sm text-ink-soft">
        Page {page} of {pages}
      </span>
      <Button variant="secondary" disabled={!hasNext} onClick={() => onPage(result.offset + result.limit)}>
        Next page
      </Button>
    </nav>
  );
}
