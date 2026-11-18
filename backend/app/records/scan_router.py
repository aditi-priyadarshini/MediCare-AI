"""Scan-to-fill: read a photo or PDF of a report and return a *draft* for the forms.

A scan saves nothing: not the file, not the text, not the result. It reads the upload in memory and
answers with suggested field values. The patient reviews them, and the ordinary create endpoints
(``POST /records`` + ``/records/{id}/file`` and ``POST /labs/bulk``) store whatever they confirm.
The audit row holds sizes and counts only, never text or values.
"""

from typing import Annotated

from fastapi import APIRouter, File, Request, UploadFile

from app.api.deps import CurrentUser, DbDep
from app.audit.service import record
from app.core.errors import AppError
from app.core.ratelimit import enforce
from app.core.storage import sniff_content_type
from app.records import extract, parse
from app.records.schemas import ScanLabRow, ScanOut, ScanRecordDraft, ScanStatus

router = APIRouter(tags=["records"])

OCR_NOTE = (
    "This was read from a picture, so some characters can be wrong (for example 1 and l, or 0 and "
    "O). Check every value against your report before saving."
)


def _caps(request: Request) -> extract.ScanCapabilities:
    settings = request.app.state.settings
    if not settings.scan_enabled:
        return extract.ScanCapabilities(ocr=False, pdf_text=False, pdf_ocr=False)
    return extract.capabilities(settings.tesseract_cmd)


@router.get("/records/scan/status", response_model=ScanStatus)
def scan_status(request: Request, user: CurrentUser):
    """What this server can read, so the page shows the scan buttons only when they can work."""
    caps = _caps(request)
    return ScanStatus(
        available=caps.available,
        photos=caps.ocr,
        pdf_text=caps.pdf_text,
        scanned_pdf=caps.pdf_ocr,
    )


@router.post("/records/scan", response_model=ScanOut)
def scan_document(
    request: Request,
    user: CurrentUser,
    db: DbDep,
    file: Annotated[UploadFile, File()],
):
    settings = request.app.state.settings
    if not _caps(request).available:
        raise AppError(
            503, "SCAN_UNAVAILABLE", "Scanning isn't available here. You can type the details."
        )
    enforce(request, "scan", str(user.id), settings.scan_requests_per_minute, 60)

    limit = settings.max_upload_bytes
    data = file.file.read(limit + 1)  # never buffer more than the cap
    if len(data) > limit:
        raise AppError(413, "FILE_TOO_LARGE", f"Files can be up to {limit // (1024 * 1024)} MB.")
    if not data:
        raise AppError(422, "VALIDATION_ERROR", "The file is empty.")
    content_type = sniff_content_type(data)  # magic bytes; the declared type is never trusted
    if content_type is None:
        raise AppError(415, "UNSUPPORTED_FILE_TYPE", "Upload a PDF, PNG or JPEG file.")

    try:
        got = extract.extract_text(
            data,
            content_type,
            tesseract_cmd=settings.tesseract_cmd,
            languages=settings.ocr_languages,
            timeout=float(settings.scan_timeout_seconds),
            max_pages=settings.scan_max_pages,
            max_pixels=settings.scan_max_pixels,
        )
    except extract.ScanUnavailable as exc:
        raise AppError(exc.status, exc.code, str(exc)) from exc

    result = parse.parse_report(got.text)
    draft, labs = result.record, result.labs

    warnings: list[str] = []
    text_found = bool(got.text.strip())
    if not text_found:
        warnings.append(
            "No text could be read. Try a sharper photo in good light, with the whole page in view."
        )
    if got.truncated:
        warnings.append(f"Only the first {got.pages_read} of {got.pages_total} pages were read.")
    if got.method != "pdf_text" and text_found:
        warnings.append(OCR_NOTE)
    if draft.date_ambiguous and draft.record_date:
        warnings.append(
            "The date could be day/month or month/day. It was read as day first; please check it."
        )
    if text_found and draft.record_type == "lab_report" and not labs:
        warnings.append(
            "This looks like a lab report but no test rows could be told apart. "
            "You can add the results by hand."
        )

    record(
        db,
        "record.scan",
        request,
        actor_user_id=user.id,
        resource_type="health_record",
        metadata={
            "size": len(data),
            "content_type": content_type,
            "method": got.method,
            "pages": got.pages_read,
            "lab_rows": len(labs),
        },
    )
    db.commit()

    return ScanOut(
        method=got.method,  # type: ignore[arg-type]
        pages_read=got.pages_read,
        pages_total=got.pages_total,
        text_found=text_found,
        record=ScanRecordDraft(
            record_type=draft.record_type,  # type: ignore[arg-type]
            title=draft.title,
            record_date=draft.record_date,
            date_ambiguous=draft.date_ambiguous,
            provider_name=draft.provider_name,
        ),
        labs=[
            ScanLabRow(
                test_name=r.test_name,
                result=r.result,
                unit=r.unit,
                ref_low=r.ref_low,
                ref_high=r.ref_high,
                confidence=r.confidence,  # type: ignore[arg-type]
                source_line=r.source_line,
            )
            for r in labs
        ],
        warnings=warnings,
    )
