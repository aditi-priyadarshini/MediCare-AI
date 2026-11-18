import uuid
from decimal import Decimal
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, File, Query, Request, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbDep
from app.audit.service import record
from app.core.errors import AppError
from app.core.pagination import Page, PageDep
from app.core.storage import LocalFileStore, safe_display_name, sniff_content_type
from app.records import service as svc
from app.records.models import HealthRecord, LabResult
from app.records.schemas import (
    LabBulkIn,
    LabIn,
    LabOut,
    LabPatch,
    LabTestSummary,
    LabTrend,
    RecordIn,
    RecordOut,
    RecordPatch,
    RecordType,
    TrendPoint,
)

router = APIRouter(tags=["records"])

MAX_FILES_PER_PATIENT = 100
MAX_LABS_PER_PATIENT = 2000
TREND_LIMIT = 500


def _store(request: Request) -> LocalFileStore:
    return LocalFileStore(request.app.state.settings.storage_dir)


def _owned_lab(db: Session, lab_id: uuid.UUID, user) -> LabResult:
    row = db.scalar(
        select(LabResult).where(LabResult.id == lab_id, LabResult.patient_user_id == user.id)
    )
    if row is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")
    return row


def _same(new, old) -> bool:
    """Equality that treats Decimal (from the database) and float (from JSON) alike."""
    if new is None or old is None:
        return new is old
    if isinstance(old, Decimal):
        return float(new) == float(old)
    return new == old


def _page(db: Session, model, user, params, *filters, order):
    base = select(model).where(model.patient_user_id == user.id, *filters)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = db.scalars(base.order_by(*order).limit(params.limit).offset(params.offset)).all()
    return {"items": items, "total": total, "limit": params.limit, "offset": params.offset}


# ----------------------------------------------------------------------- records
@router.get("/records", response_model=Page[RecordOut])
def list_records(
    user: CurrentUser,
    db: DbDep,
    params: PageDep,
    record_type: Annotated[RecordType | None, Query()] = None,
    include_archived: Annotated[bool, Query()] = False,
):
    filters = []
    if not include_archived:
        filters.append(HealthRecord.status == "active")
    if record_type:
        filters.append(HealthRecord.record_type == record_type)
    return _page(
        db,
        HealthRecord,
        user,
        params,
        *filters,
        order=(HealthRecord.record_date.desc().nulls_last(), HealthRecord.created_at.desc()),
    )


@router.post("/records", response_model=RecordOut, status_code=201)
def create_record(body: RecordIn, request: Request, user: CurrentUser, db: DbDep):
    row = HealthRecord(
        patient_user_id=user.id, verification_status="patient_reported", **body.model_dump()
    )
    db.add(row)
    db.flush()
    record(
        db,
        "record.create",
        request,
        actor_user_id=user.id,
        resource_type="health_record",
        resource_id=row.id,
    )
    db.commit()
    return row


@router.get("/records/{record_id}", response_model=RecordOut)
def get_record(record_id: uuid.UUID, user: CurrentUser, db: DbDep):
    return svc.owned_record_or_404(db, record_id, user)


@router.patch("/records/{record_id}", response_model=RecordOut)
def update_record(
    record_id: uuid.UUID, body: RecordPatch, request: Request, user: CurrentUser, db: DbDep
):
    row = svc.owned_record_or_404(db, record_id, user)
    data = body.model_dump(exclude_unset=True)
    for required in ("record_type", "title", "status"):
        if required in data and data[required] is None:
            raise AppError(422, "VALIDATION_ERROR", f"{required} cannot be empty.")
    content_fields = {"record_type", "title", "record_date", "provider_name", "notes"}
    if any(k in data and data[k] != getattr(row, k) for k in content_fields):
        row.verification_status = "patient_reported"  # edited content is no longer confirmed
    for key, value in data.items():
        setattr(row, key, value)
    record(
        db,
        "record.update",
        request,
        actor_user_id=user.id,
        resource_type="health_record",
        resource_id=row.id,
    )
    db.commit()
    return row


@router.post("/records/{record_id}/file", response_model=RecordOut)
def upload_record_file(
    record_id: uuid.UUID,
    request: Request,
    user: CurrentUser,
    db: DbDep,
    file: Annotated[UploadFile, File()],
):
    row = svc.owned_record_or_404(db, record_id, user)
    limit = request.app.state.settings.max_upload_bytes
    data = file.file.read(limit + 1)  # never buffer more than the cap
    if len(data) > limit:
        raise AppError(413, "FILE_TOO_LARGE", f"Files can be up to {limit // (1024 * 1024)} MB.")
    if not data:
        raise AppError(422, "VALIDATION_ERROR", "The file is empty.")
    content_type = sniff_content_type(data)
    if content_type is None:
        raise AppError(415, "UNSUPPORTED_FILE_TYPE", "Upload a PDF, PNG or JPEG file.")

    if row.file_key is None:
        used = (
            db.scalar(
                select(func.count())
                .select_from(HealthRecord)
                .where(HealthRecord.patient_user_id == user.id, HealthRecord.file_key.is_not(None))
            )
            or 0
        )
        if used >= MAX_FILES_PER_PATIENT:
            raise AppError(
                409,
                "LIMIT_REACHED",
                f"You can store up to {MAX_FILES_PER_PATIENT} files.",
            )

    store = _store(request)
    old_key = row.file_key
    key, digest = store.save(data)
    row.file_key = key
    row.file_name = safe_display_name(file.filename)
    row.file_content_type = content_type
    row.file_size = len(data)
    row.file_sha256 = digest
    row.verification_status = "patient_reported"
    record(
        db,
        "record.file_upload",
        request,
        actor_user_id=user.id,
        resource_type="health_record",
        resource_id=row.id,
        metadata={"size": len(data), "content_type": content_type},
    )
    try:
        db.commit()
    except Exception:
        store.delete(key)  # no orphan on a failed transaction
        raise
    if old_key:
        store.delete(old_key)
    return row


@router.get("/records/{record_id}/file")
def download_record_file(record_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    row = svc.owned_record_or_404(db, record_id, user)
    if row.file_key is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")
    try:
        data = _store(request).read(row.file_key)
    except FileNotFoundError:
        raise AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.") from None
    record(
        db,
        "record.file_download",
        request,
        actor_user_id=user.id,
        resource_type="health_record",
        resource_id=row.id,
    )
    db.commit()
    name = row.file_name or "record"
    ascii_name = name.encode("ascii", "ignore").decode() or "record"
    return Response(
        content=data,
        media_type=row.file_content_type or "application/octet-stream",
        headers={
            "Content-Disposition": (
                f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"
            ),
        },
    )


@router.delete("/records/{record_id}/file", response_model=RecordOut)
def remove_record_file(record_id: uuid.UUID, request: Request, user: CurrentUser, db: DbDep):
    row = svc.owned_record_or_404(db, record_id, user)
    old_key = row.file_key
    if old_key is None:
        return row
    row.file_key = row.file_name = row.file_content_type = row.file_size = row.file_sha256 = None
    record(
        db,
        "record.file_remove",
        request,
        actor_user_id=user.id,
        resource_type="health_record",
        resource_id=row.id,
    )
    db.commit()
    _store(request).delete(old_key)
    return row


# --------------------------------------------------------------------------- labs
@router.get("/labs", response_model=Page[LabOut])
def list_labs(
    user: CurrentUser,
    db: DbDep,
    params: PageDep,
    test_name: Annotated[str | None, Query(max_length=120)] = None,
    record_id: Annotated[uuid.UUID | None, Query()] = None,
    include_archived: Annotated[bool, Query()] = False,
):
    filters = []
    if not include_archived:
        filters.append(LabResult.status == "active")
    if test_name:
        filters.append(func.lower(LabResult.test_name) == " ".join(test_name.split()).lower())
    if record_id:
        filters.append(LabResult.record_id == record_id)
    return _page(
        db,
        LabResult,
        user,
        params,
        *filters,
        order=(LabResult.observed_on.desc(), LabResult.created_at.desc()),
    )


@router.get("/labs/tests", response_model=list[LabTestSummary])
def lab_tests(user: CurrentUser, db: DbDep):
    """One row per distinct test (case-insensitive) with its most recent result."""
    rows = db.scalars(
        select(LabResult)
        .where(LabResult.patient_user_id == user.id, LabResult.status == "active")
        .order_by(LabResult.observed_on.desc(), LabResult.created_at.desc())
    ).all()
    groups: dict[str, list[LabResult]] = {}
    for r in rows:
        groups.setdefault(r.test_name.casefold(), []).append(r)
    out = []
    for items in groups.values():
        latest = items[0]
        out.append(
            LabTestSummary(
                test_name=latest.test_name,
                count=len(items),
                latest_observed_on=latest.observed_on,
                latest_value_numeric=latest.value_numeric,
                latest_value_text=latest.value_text,
                latest_unit=latest.unit,
                latest_flag=latest.flag,
            )
        )
    out.sort(key=lambda t: t.test_name.casefold())
    return out


@router.get("/labs/trend", response_model=LabTrend)
def lab_trend(
    user: CurrentUser,
    db: DbDep,
    test_name: Annotated[str, Query(min_length=1, max_length=120)],
):
    """Numeric results for one test over time, oldest first (for charting)."""
    wanted = " ".join(test_name.split()).lower()
    rows = db.scalars(
        select(LabResult)
        .where(
            LabResult.patient_user_id == user.id,
            LabResult.status == "active",
            LabResult.value_numeric.is_not(None),
            func.lower(LabResult.test_name) == wanted,
        )
        .order_by(LabResult.observed_on.desc(), LabResult.created_at.desc())
        .limit(TREND_LIMIT)
    ).all()
    if not rows:
        raise AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.")
    rows = list(reversed(rows))
    latest = rows[-1]  # reference range and unit come from the newest report
    return LabTrend(
        test_name=latest.test_name,
        unit=latest.unit,
        ref_low=latest.ref_low,
        ref_high=latest.ref_high,
        points=[
            TrendPoint(id=r.id, observed_on=r.observed_on, value=r.value_numeric, flag=r.flag)
            for r in rows
        ],
    )


@router.post("/labs", response_model=LabOut, status_code=201)
def create_lab(body: LabIn, request: Request, user: CurrentUser, db: DbDep):
    if body.record_id is not None:
        svc.owned_record_or_404(db, body.record_id, user)
    count = db.scalar(
        select(func.count()).select_from(LabResult).where(LabResult.patient_user_id == user.id)
    )
    if (count or 0) >= MAX_LABS_PER_PATIENT:
        raise AppError(409, "LIMIT_REACHED", f"You can save up to {MAX_LABS_PER_PATIENT} results.")
    row = LabResult(
        patient_user_id=user.id, verification_status="patient_reported", **body.model_dump()
    )
    svc.validate_lab_state(row)
    svc.apply_flag(row)
    db.add(row)
    db.flush()
    record(
        db,
        "lab.create",
        request,
        actor_user_id=user.id,
        resource_type="lab_result",
        resource_id=row.id,
    )
    db.commit()
    return row


@router.post("/labs/bulk", response_model=list[LabOut], status_code=201)
def create_labs_bulk(body: LabBulkIn, request: Request, user: CurrentUser, db: DbDep):
    """Save several confirmed results at once (the review step of a scan). All or none: one bad
    row rejects the request and nothing is saved, so a half-imported report can't happen."""
    if body.record_id is not None:
        svc.owned_record_or_404(db, body.record_id, user)
    count = db.scalar(
        select(func.count()).select_from(LabResult).where(LabResult.patient_user_id == user.id)
    )
    if (count or 0) + len(body.items) > MAX_LABS_PER_PATIENT:
        raise AppError(409, "LIMIT_REACHED", f"You can save up to {MAX_LABS_PER_PATIENT} results.")
    rows = []
    for item in body.items:
        data = item.model_dump()
        data["record_id"] = body.record_id
        row = LabResult(patient_user_id=user.id, verification_status="patient_reported", **data)
        svc.validate_lab_state(row)
        svc.apply_flag(row)
        rows.append(row)
    db.add_all(rows)
    db.flush()
    record(
        db,
        "lab.bulk_create",
        request,
        actor_user_id=user.id,
        resource_type="lab_result",
        metadata={"count": len(rows), "linked_to_record": body.record_id is not None},
    )
    db.commit()
    return rows


@router.patch("/labs/{lab_id}", response_model=LabOut)
def update_lab(lab_id: uuid.UUID, body: LabPatch, request: Request, user: CurrentUser, db: DbDep):
    row = _owned_lab(db, lab_id, user)
    data = body.model_dump(exclude_unset=True)
    for required in ("test_name", "observed_on", "status"):
        if required in data and data[required] is None:
            raise AppError(422, "VALIDATION_ERROR", f"{required} cannot be empty.")
    if data.get("record_id") is not None:
        svc.owned_record_or_404(db, data["record_id"], user)
    content_fields = (
        "test_name",
        "value_numeric",
        "value_text",
        "unit",
        "ref_low",
        "ref_high",
        "observed_on",
    )
    changed = any(k in data and not _same(data[k], getattr(row, k)) for k in content_fields)
    if changed:
        row.verification_status = "patient_reported"
    for key, value in data.items():
        setattr(row, key, value)
    svc.validate_lab_state(row)
    svc.apply_flag(row)
    record(
        db,
        "lab.update",
        request,
        actor_user_id=user.id,
        resource_type="lab_result",
        resource_id=row.id,
    )
    db.commit()
    return row
