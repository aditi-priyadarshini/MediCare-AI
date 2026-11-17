"use client";

import { useRef, useState } from "react";
import { LocationButton, Pager, PlaceActions, SourceLine, type Coords } from "@/components/care/Shared";
import { Alert, Button, Card, EmptyState, TextField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { priceText, queryString, stockHeadline, type CarePage, type Pharmacy } from "@/lib/care";
import { cn } from "@/lib/cn";
import type { MedicineHit } from "@/lib/types";

function StockBlock({ pharmacy }: { pharmacy: Pharmacy }) {
  const stock = pharmacy.stock;
  if (!stock) return null;
  const price = priceText(stock);
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        stock.call_to_confirm ? "border-amber-600/30 bg-amber-100" : "border-line bg-mint-100",
      )}
    >
      <p className="font-medium text-ink">{stockHeadline(stock)}</p>
      <p className="mt-0.5 text-ink-soft">{stock.message}</p>
      {stock.pack_size_text && <p className="text-ink-soft">Pack: {stock.pack_size_text}</p>}
      {price && <p className="text-ink-soft">{price}</p>}
    </div>
  );
}

export function PharmacyFinder() {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [medQ, setMedQ] = useState("");
  const [hits, setHits] = useState<MedicineHit[]>([]);
  const [medicine, setMedicine] = useState<MedicineHit | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [result, setResult] = useState<CarePage<Pharmacy> | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  async function searchMedicine(value: string) {
    setMedQ(value);
    setMedicine(null);
    const n = ++seq.current;
    if (value.trim().length < 2) return setHits([]);
    try {
      const found = await api<MedicineHit[]>(`/medicines?q=${encodeURIComponent(value.trim())}`);
      if (n === seq.current) setHits(found);
    } catch {
      if (n === seq.current) setHits([]);
    }
  }

  async function search(e?: React.FormEvent, offset = 0) {
    e?.preventDefault();
    setBusy(true);
    setFailure(null);
    try {
      const qs = queryString({
        q: q.trim(),
        city: city.trim(),
        lat: coords?.lat,
        lon: coords?.lon,
        medicine_id: medicine?.id,
        limit: 20,
        offset: offset || undefined,
      });
      setResult(await api<CarePage<Pharmacy>>(`/pharmacies/search${qs}`));
    } catch (err) {
      setResult(null);
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="ph-h" className="space-y-4">
      <div>
        <h2 id="ph-h" className="text-lg font-semibold text-ink">
          Find a pharmacy
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Listings come from the sources named on each card. Stock is only shown when a source has reported it, and
          always with the time.
        </p>
      </div>
      <form onSubmit={search} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Name or area" value={q} onChange={(e) => setQ(e.target.value)} optional />
          <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} optional />
        </div>
        <div>
          <TextField
            label="Check stock of a medicine"
            hint="Optional. Pick a medicine from the list."
            value={medQ}
            onChange={(e) => searchMedicine(e.target.value)}
            autoComplete="off"
            optional
          />
          {hits.length > 0 && (
            <ul className="mt-1 divide-y divide-line rounded-lg border border-line">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      seq.current++;
                      setMedicine(h);
                      setMedQ(`${h.name} ${h.strength_text ?? ""}`.trim());
                      setHits([]);
                    }}
                    className="min-h-[44px] w-full px-3 text-left text-sm hover:bg-mint-100"
                  >
                    {h.name} {h.strength_text} <span className="text-ink-soft">{h.form}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {medicine && <p className="mt-1 text-xs text-ink-soft">Showing reported stock of {medicine.name}.</p>}
        </div>
        <LocationButton coords={coords} onChange={setCoords} />
        <Button type="submit" loading={busy}>
          Search pharmacies
        </Button>
      </form>

      {failure && <Alert tone="danger" title="Search failed">{failure}</Alert>}

      {result && (
        <div className="space-y-3" aria-live="polite">
          <Alert tone="info">{result.notice}</Alert>
          <p className="text-sm text-ink-soft">
            {result.total} {result.total === 1 ? "pharmacy" : "pharmacies"} found
            {coords ? ", nearest first. Pharmacies without a listed location are not shown." : ", listed by name."}
          </p>
          {result.items.length === 0 && (
            <EmptyState title="No pharmacies found">Try a different name, a wider area, or remove the location.</EmptyState>
          )}
          <ul className="grid gap-4 xl:grid-cols-2">
            {result.items.map((p) => (
              <li key={p.id} className="space-y-2 self-start rounded-lg border border-line p-4">
                <div>
                  <h3 className="font-semibold text-ink">{p.name}</h3>
                  <p className="text-sm text-ink-soft">
                    {[p.address_line, p.city, p.state, p.postal_code].filter(Boolean).join(", ")}
                  </p>
                  {p.hours_text ? (
                    <p className="text-sm text-ink-soft">Hours as listed by the source: {p.hours_text}</p>
                  ) : (
                    <p className="text-sm text-ink-soft">No hours listed. Call to ask.</p>
                  )}
                </div>
                <StockBlock pharmacy={p} />
                <PlaceActions
                  phone={p.phone}
                  latitude={p.latitude}
                  longitude={p.longitude}
                  distanceKm={p.distance_km}
                />
                <SourceLine source={p.source} freshness={p.freshness} />
              </li>
            ))}
          </ul>
          <Pager result={result} onPage={(offset) => void search(undefined, offset)} />
        </div>
      )}
    </Card>
  );
}
