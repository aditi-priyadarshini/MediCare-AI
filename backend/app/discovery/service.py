"""Search, freshness labelling and snapshot ingest for pharmacies and doctors.

Two rules run through this module. Everything shown carries its source and age. And absence of
data is shown as absence: no feed means "call to confirm", never an assumed answer.
"""

import math
import uuid
from datetime import UTC, datetime

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.discovery.models import (
    Doctor,
    DoctorCredential,
    Pharmacy,
    PharmacyInventorySnapshot,
    ProviderSource,
)
from app.discovery.providers import InventoryItem
from app.discovery.schemas import (
    NO_FEED_MESSAGE,
    CredentialOut,
    DoctorBrief,
    DoctorOut,
    Freshness,
    PharmacyOut,
    SourceBrief,
    StockOut,
)
from app.medications.models import Medicine

EARTH_RADIUS_KM = 6371.0088
MAX_GEO_CANDIDATES = 1000
DEFAULT_RADIUS_KM = 25.0
_STATUS_RANK = {"unverified": 0, "source_listed": 1, "verified": 2}


def not_found(what: str = "item") -> AppError:
    return AppError(404, "RESOURCE_NOT_FOUND", f"That {what} was not found.")


def now_utc() -> datetime:
    return datetime.now(UTC)


# ------------------------------------------------------------------------------ freshness
def _ago(seconds: float) -> str:
    if seconds < 3600:
        return "less than an hour ago"
    hours = int(seconds // 3600)
    if hours < 48:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    days = int(seconds // 86400)
    return f"{days} days ago"


def freshness(
    observed_at: datetime, stale_after_hours: int, now: datetime | None = None
) -> Freshness:
    """Fresh while within the source's own policy; otherwise stale (shown, never hidden)."""
    now = now or now_utc()
    seconds = max((now - observed_at).total_seconds(), 0.0)
    stale = seconds > stale_after_hours * 3600
    ago = _ago(seconds)
    return Freshness(
        state="stale" if stale else "fresh",
        observed_at=observed_at,
        age_days=int(seconds // 86400),
        label=f"Last updated {ago}. May be out of date." if stale else f"Updated {ago}.",
    )


# ---------------------------------------------------------------------------- geography
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def bounding_box(lat: float, lon: float, radius_km: float) -> tuple[float, float, float, float]:
    """(min_lat, max_lat, min_lon, max_lon): a cheap SQL pre-filter before exact distances."""
    dlat = math.degrees(radius_km / EARTH_RADIUS_KM)
    # Near the poles the longitude span explodes; fall back to the whole range.
    cos = math.cos(math.radians(lat))
    dlon = 180.0 if cos < 1e-6 else min(180.0, math.degrees(radius_km / (EARTH_RADIUS_KM * cos)))
    return lat - dlat, lat + dlat, lon - dlon, lon + dlon


def like_pattern(text: str) -> str:
    escaped = text.strip().lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _geo_filter(stmt: Select, model, lat: float | None, lon: float | None, radius_km: float):
    if lat is None or lon is None:
        return stmt
    lo_lat, hi_lat, lo_lon, hi_lon = bounding_box(lat, lon, radius_km)
    return stmt.where(
        model.latitude.is_not(None),
        model.latitude.between(lo_lat, hi_lat),
        model.longitude.between(lo_lon, hi_lon),
    )


def rank_by_distance[T](
    rows: list[T], lat: float, lon: float, radius_km: float, key
) -> list[tuple[T, float]]:
    """Exact distances, those beyond the radius dropped, nearest first (name breaks ties)."""
    out = []
    for row in rows:
        d = haversine_km(lat, lon, float(row.latitude), float(row.longitude))
        if d <= radius_km:
            out.append((row, round(d, 1)))
    out.sort(key=lambda pair: (pair[1], key(pair[0]).lower()))
    return out


def _sources(db: Session, ids: set[uuid.UUID]) -> dict[uuid.UUID, ProviderSource]:
    if not ids:
        return {}
    return {s.id: s for s in db.scalars(select(ProviderSource).where(ProviderSource.id.in_(ids)))}


# ------------------------------------------------------------------------------ stock
def stock_for(
    snapshot: PharmacyInventorySnapshot | None,
    source: ProviderSource | None,
    now: datetime | None = None,
) -> StockOut:
    if snapshot is None or source is None:
        return StockOut(state="no_feed", call_to_confirm=True, message=NO_FEED_MESSAGE)
    fresh = freshness(snapshot.source_timestamp, source.stale_after_hours, now)
    is_fresh = fresh.state == "fresh"
    return StockOut(
        state="reported",
        reported=snapshot.availability,
        price_amount=snapshot.price_amount,
        currency=snapshot.currency,
        pack_size_text=snapshot.pack_size_text,
        source_name=source.name,
        source_timestamp=snapshot.source_timestamp,
        freshness=fresh,
        call_to_confirm=not is_fresh,
        message=(
            f"Reported by {source.name}. {fresh.label}"
            if is_fresh
            else f"Reported by {source.name}. {fresh.label} Call to confirm availability."
        ),
    )


def latest_snapshots(
    db: Session, pharmacy_ids: list[uuid.UUID], medicine_id: uuid.UUID | None = None
) -> list[PharmacyInventorySnapshot]:
    """The newest report per (pharmacy, medicine)."""
    if not pharmacy_ids:
        return []
    S = PharmacyInventorySnapshot
    stmt = (
        select(S)
        .where(S.pharmacy_id.in_(pharmacy_ids))
        .distinct(S.pharmacy_id, S.medicine_id)
        .order_by(S.pharmacy_id, S.medicine_id, S.source_timestamp.desc())
    )
    if medicine_id is not None:
        stmt = stmt.where(S.medicine_id == medicine_id)
    return list(db.scalars(stmt))


# ------------------------------------------------------------------------- pharmacies
def search_pharmacies(
    db: Session,
    *,
    q: str | None,
    city: str | None,
    lat: float | None,
    lon: float | None,
    radius_km: float,
    medicine_id: uuid.UUID | None,
    limit: int,
    offset: int,
) -> tuple[list[PharmacyOut], int]:
    stmt = select(Pharmacy).where(Pharmacy.status == "active")
    if q:
        pat = like_pattern(q)
        stmt = stmt.where(
            or_(
                func.lower(Pharmacy.name).like(pat, escape="\\"),
                func.lower(Pharmacy.address_line).like(pat, escape="\\"),
                func.lower(Pharmacy.city).like(pat, escape="\\"),
                Pharmacy.postal_code.like(pat, escape="\\"),
            )
        )
    if city:
        stmt = stmt.where(func.lower(Pharmacy.city) == city.strip().lower())
    located = lat is not None and lon is not None
    if located:
        stmt = _geo_filter(stmt, Pharmacy, lat, lon, radius_km)
        rows = list(db.scalars(stmt.order_by(Pharmacy.name).limit(MAX_GEO_CANDIDATES)))
        ranked = rank_by_distance(rows, lat, lon, radius_km, lambda p: p.name)
        total = len(ranked)
        page = ranked[offset : offset + limit]
    else:
        total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        rows = list(
            db.scalars(stmt.order_by(Pharmacy.name, Pharmacy.id).limit(limit).offset(offset))
        )
        page = [(row, None) for row in rows]

    sources = _sources(db, {p.source_id for p, _ in page})
    snapshots: dict[uuid.UUID, PharmacyInventorySnapshot] = {}
    inventory_sources: dict[uuid.UUID, ProviderSource] = {}
    if medicine_id is not None:
        for snap in latest_snapshots(db, [p.id for p, _ in page], medicine_id):
            snapshots[snap.pharmacy_id] = snap
        inventory_sources = _sources(db, {s.source_id for s in snapshots.values()})

    now = now_utc()
    items = []
    for pharmacy, distance in page:
        src = sources[pharmacy.source_id]
        snap = snapshots.get(pharmacy.id)
        items.append(
            PharmacyOut(
                **_place_fields(pharmacy),
                name=pharmacy.name,
                hours_text=pharmacy.hours_text,
                verification_status=pharmacy.verification_status,
                source=SourceBrief.model_validate(src),
                freshness=freshness(pharmacy.source_observed_at, src.stale_after_hours, now),
                distance_km=distance,
                stock=(
                    stock_for(snap, inventory_sources.get(snap.source_id) if snap else None, now)
                    if medicine_id is not None
                    else None
                ),
            )
        )
    return items, total


def _place_fields(row) -> dict:
    return {
        "id": row.id,
        "address_line": row.address_line,
        "city": row.city,
        "state": row.state,
        "postal_code": row.postal_code,
        "latitude": float(row.latitude) if row.latitude is not None else None,
        "longitude": float(row.longitude) if row.longitude is not None else None,
        "phone": row.phone,
    }


def pharmacy_out(db: Session, pharmacy: Pharmacy) -> PharmacyOut:
    src = db.get(ProviderSource, pharmacy.source_id)
    return PharmacyOut(
        **_place_fields(pharmacy),
        name=pharmacy.name,
        hours_text=pharmacy.hours_text,
        verification_status=pharmacy.verification_status,
        source=SourceBrief.model_validate(src),
        freshness=freshness(pharmacy.source_observed_at, src.stale_after_hours),
    )


def inventory_items(
    db: Session, pharmacy_id: uuid.UUID, medicine_id: uuid.UUID | None
) -> list[tuple[Medicine, StockOut]]:
    snaps = latest_snapshots(db, [pharmacy_id], medicine_id)
    if not snaps:
        return []
    sources = _sources(db, {s.source_id for s in snaps})
    medicines = {
        m.id: m
        for m in db.scalars(select(Medicine).where(Medicine.id.in_({s.medicine_id for s in snaps})))
    }
    now = now_utc()
    out = [(medicines[s.medicine_id], stock_for(s, sources[s.source_id], now)) for s in snaps]
    out.sort(key=lambda pair: (pair[0].name.lower(), pair[0].strength_text or ""))
    return out


def ingest_inventory(
    db: Session, pharmacy: Pharmacy, source: ProviderSource, items: list[InventoryItem]
) -> int:
    """Store stock reports. The one entry point for both the admin feed and any future adapter."""
    if source.kind != "inventory":
        raise AppError(422, "VALIDATION_ERROR", "That source is not an inventory source.")
    if pharmacy.status != "active":
        raise AppError(409, "PHARMACY_RETIRED", "That pharmacy is retired.")
    ids = {i.medicine_id for i in items}
    known = set(db.scalars(select(Medicine.id).where(Medicine.id.in_(ids))))
    if ids - known:
        raise AppError(422, "VALIDATION_ERROR", "One or more medicines do not exist.")
    for item in items:
        db.add(
            PharmacyInventorySnapshot(
                pharmacy_id=pharmacy.id,
                medicine_id=item.medicine_id,
                availability=item.availability,
                price_amount=item.price_amount,
                currency=item.currency,
                pack_size_text=item.pack_size_text,
                source_id=source.id,
                source_timestamp=item.source_timestamp,
            )
        )
    return len(items)


# --------------------------------------------------------------------------- doctors
def mask_registration(number: str | None) -> str | None:
    if not number:
        return None
    if len(number) <= 4:
        return "••••"
    return "•" * (len(number) - 4) + number[-4:]


def credential_label(status: str, source_name: str | None, verified_at: datetime | None) -> str:
    if status == "verified":
        when = verified_at.date().isoformat() if verified_at else "an unrecorded date"
        return f"Verified against {source_name} on {when}."
    if status == "source_listed":
        return "Listed by the directory source. Not independently verified."
    return "Not verified."


def best_credential_status(creds: list[DoctorCredential]) -> str:
    if not creds:
        return "unverified"
    return max((c.status for c in creds), key=lambda s: _STATUS_RANK[s])


def doctor_notes(doctor: Doctor) -> str:
    if doctor.booking_mode == "provider":
        return (
            "Requests are sent to this clinic's booking system. It is only confirmed once "
            "the clinic replies."
        )
    return (
        "Requests are saved in this app only and are not sent to the clinic. "
        "Call the clinic to book."
    )


def build_doctors(db: Session, doctors: list[tuple[Doctor, float | None]]) -> list[DoctorOut]:
    ids = [d.id for d, _ in doctors]
    creds: dict[uuid.UUID, list[DoctorCredential]] = {i: [] for i in ids}
    if ids:
        for c in db.scalars(
            select(DoctorCredential)
            .where(DoctorCredential.doctor_id.in_(ids))
            .order_by(DoctorCredential.created_at, DoctorCredential.id)
        ):
            creds[c.doctor_id].append(c)
    source_ids = {d.source_id for d, _ in doctors} | {
        c.verification_source_id for cs in creds.values() for c in cs if c.verification_source_id
    }
    sources = _sources(db, source_ids)
    now = now_utc()
    out = []
    for doctor, distance in doctors:
        src = sources[doctor.source_id]
        cred_out = []
        for c in creds[doctor.id]:
            vsrc = sources.get(c.verification_source_id) if c.verification_source_id else None
            cred_out.append(
                CredentialOut(
                    qualification=c.qualification,
                    registration_masked=mask_registration(c.registration_number),
                    issuing_authority=c.issuing_authority,
                    status=c.status,
                    verified_at=c.verified_at,
                    verification_source=SourceBrief.model_validate(vsrc) if vsrc else None,
                    label=credential_label(c.status, vsrc.name if vsrc else None, c.verified_at),
                )
            )
        best = best_credential_status(creds[doctor.id])
        best_label = next(
            (c.label for c in cred_out if c.status == best),
            credential_label("unverified", None, None),
        )
        out.append(
            DoctorOut(
                **_place_fields(doctor),
                display_name=doctor.display_name,
                clinic_name=doctor.clinic_name,
                specialties=list(doctor.specialties),
                languages=list(doctor.languages),
                booking_mode=doctor.booking_mode,
                appointment_note=doctor_notes(doctor),
                credential_status=best,
                credential_label=best_label,
                credentials=cred_out,
                source=SourceBrief.model_validate(src),
                freshness=freshness(doctor.source_observed_at, src.stale_after_hours, now),
                distance_km=distance,
            )
        )
    return out


def search_doctors(
    db: Session,
    *,
    q: str | None,
    specialty: str | None,
    city: str | None,
    language: str | None,
    verified_only: bool,
    lat: float | None,
    lon: float | None,
    radius_km: float,
    limit: int,
    offset: int,
) -> tuple[list[DoctorOut], int]:
    stmt = select(Doctor).where(Doctor.status == "active")
    if q:
        pat = like_pattern(q)
        stmt = stmt.where(
            or_(
                func.lower(Doctor.display_name).like(pat, escape="\\"),
                func.lower(func.coalesce(Doctor.clinic_name, "")).like(pat, escape="\\"),
            )
        )
    if specialty:
        stmt = stmt.where(Doctor.specialties.contains([" ".join(specialty.lower().split())]))
    if language:
        stmt = stmt.where(Doctor.languages.contains([" ".join(language.lower().split())]))
    if city:
        stmt = stmt.where(func.lower(Doctor.city) == city.strip().lower())
    if verified_only:
        stmt = stmt.where(
            select(DoctorCredential.id)
            .where(
                and_(DoctorCredential.doctor_id == Doctor.id, DoctorCredential.status == "verified")
            )
            .exists()
        )
    if lat is not None and lon is not None:
        stmt = _geo_filter(stmt, Doctor, lat, lon, radius_km)
        rows = list(db.scalars(stmt.order_by(Doctor.display_name).limit(MAX_GEO_CANDIDATES)))
        ranked = rank_by_distance(rows, lat, lon, radius_km, lambda d: d.display_name)
        total, page = len(ranked), ranked[offset : offset + limit]
    else:
        total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        rows = list(
            db.scalars(stmt.order_by(Doctor.display_name, Doctor.id).limit(limit).offset(offset))
        )
        page = [(row, None) for row in rows]
    return build_doctors(db, page), total


def doctor_brief(doctor: Doctor) -> DoctorBrief:
    return DoctorBrief(
        id=doctor.id,
        display_name=doctor.display_name,
        clinic_name=doctor.clinic_name,
        phone=doctor.phone,
        city=doctor.city,
    )
