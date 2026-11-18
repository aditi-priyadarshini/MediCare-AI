"""Records, file uploads and lab results: ownership, upload safety, server-computed fields."""

import uuid

import pytest
from sqlalchemy import select

from app.audit.models import AuditLog
from app.records.models import HealthRecord, LabResult
from app.records.service import compute_flag

REC = {"record_type": "lab_report", "title": "CBC - Nov", "record_date": "2026-11-01"}
PDF = b"%PDF-1.4\n%synthetic test file\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
JPG = b"\xff\xd8\xff\xe0" + b"0" * 32
HB = {
    "test_name": "Hemoglobin",
    "value_numeric": 11.2,
    "unit": "g/dL",
    "ref_low": 12.0,
    "ref_high": 15.5,
    "observed_on": "2026-11-01",
}


def upload(actor, rid, data=PDF, name="report.pdf", ctype="application/pdf"):
    return actor.post(f"/records/{rid}/file", files={"file": (name, data, ctype)})


# ----------------------------------------------------------------------- records
def test_record_create_and_server_controlled_fields(alice):
    r = alice.post("/records", json=REC)
    assert r.status_code == 201
    body = r.json()
    assert body["verification_status"] == "patient_reported"
    assert body["status"] == "active" and body["has_file"] is False
    for extra in (
        {"verification_status": "clinician_confirmed"},
        {"patient_user_id": str(uuid.uuid4())},
        {"file_key": "a" * 32},
        {"record_type": "mystery"},
    ):
        assert alice.post("/records", json={**REC, **extra}).status_code == 422


def test_record_date_cannot_be_far_in_future(alice):
    assert alice.post("/records", json={**REC, "record_date": "2099-01-01"}).status_code == 422


def test_record_filter_archive_and_edit_resets_verification(alice, db):
    a = alice.post("/records", json=REC).json()
    alice.post("/records", json={**REC, "record_type": "imaging", "title": "Chest X-ray"})
    assert alice.get("/records").json()["total"] == 2
    assert alice.get("/records?record_type=imaging").json()["total"] == 1
    row = db.scalar(select(HealthRecord).where(HealthRecord.id == uuid.UUID(a["id"])))
    row.verification_status = "clinician_confirmed"
    db.commit()
    out = alice.patch(f"/records/{a['id']}", json={"title": "CBC - corrected"}).json()
    assert out["verification_status"] == "patient_reported"
    alice.patch(f"/records/{a['id']}", json={"status": "entered_in_error"})
    assert alice.get("/records").json()["total"] == 1
    assert alice.get("/records?include_archived=true").json()["total"] == 2
    assert alice.patch(f"/records/{a['id']}", json={"title": None}).status_code == 422


# ------------------------------------------------------------------------ files
@pytest.mark.parametrize(
    "data,ctype", [(PDF, "application/pdf"), (PNG, "image/png"), (JPG, "image/jpeg")]
)
def test_upload_and_download_roundtrip(alice, data, ctype):
    rid = alice.post("/records", json=REC).json()["id"]
    out = upload(alice, rid, data, "scan.bin", "text/plain")  # declared type is ignored
    assert out.status_code == 200, out.text
    body = out.json()
    assert body["has_file"] and body["file_content_type"] == ctype
    assert body["file_size"] == len(data) and "file_key" not in body
    dl = alice.get(f"/records/{rid}/file")
    assert dl.status_code == 200 and dl.content == data
    assert dl.headers["content-type"] == ctype
    assert dl.headers["content-disposition"].startswith("attachment;")
    assert dl.headers["x-content-type-options"] == "nosniff"


def test_upload_rejects_wrong_type_even_with_pdf_name(alice):
    rid = alice.post("/records", json=REC).json()["id"]
    resp = upload(alice, rid, b"<html><script>alert(1)</script></html>", "x.pdf", "application/pdf")
    assert resp.status_code == 415 and resp.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"
    assert alice.get(f"/records/{rid}").json()["has_file"] is False


def test_upload_size_and_empty(alice):
    rid = alice.post("/records", json=REC).json()["id"]
    big = upload(alice, rid, PDF + b"0" * 2000)  # test cap is 1024 bytes
    assert big.status_code == 413 and big.json()["error"]["code"] == "FILE_TOO_LARGE"
    assert upload(alice, rid, b"").status_code == 422


def test_filename_is_sanitised_and_never_used_as_path(alice, settings):
    rid = alice.post("/records", json=REC).json()["id"]
    out = upload(alice, rid, PDF, '../../etc/pass"wd.pdf').json()
    assert "/" not in out["file_name"] and '"' not in out["file_name"]
    from pathlib import Path

    stored = [p for p in Path(settings.storage_dir).rglob("*") if p.is_file()]
    assert len(stored) == 1 and len(stored[0].name) == 32 and stored[0].name != out["file_name"]


def test_replace_and_remove_delete_old_bytes(alice, settings):
    from pathlib import Path

    rid = alice.post("/records", json=REC).json()["id"]
    upload(alice, rid, PDF)
    upload(alice, rid, PNG, "b.png")
    files = lambda: [p for p in Path(settings.storage_dir).rglob("*") if p.is_file()]  # noqa: E731
    assert len(files()) == 1 and alice.get(f"/records/{rid}/file").content == PNG
    assert alice.delete(f"/records/{rid}/file").json()["has_file"] is False
    assert files() == [] and alice.get(f"/records/{rid}/file").status_code == 404


def test_file_isolation_between_patients(alice, bob):
    rid = alice.post("/records", json=REC).json()["id"]
    upload(alice, rid)
    ghost = bob.get(f"/records/{uuid.uuid4()}/file")
    for resp in (
        bob.get(f"/records/{rid}"),
        bob.get(f"/records/{rid}/file"),
        bob.patch(f"/records/{rid}", json={"title": "tampered"}),
        upload(bob, rid, PNG),
        bob.delete(f"/records/{rid}/file"),
    ):
        assert resp.status_code == 404
        assert resp.json()["error"]["message"] == ghost.json()["error"]["message"]
    assert bob.get("/records").json()["total"] == 0
    assert alice.get(f"/records/{rid}/file").content == PDF  # untouched


def test_file_access_is_audited_without_content(alice, db):
    rid = alice.post("/records", json={**REC, "notes": "SECRET-NOTE"}).json()["id"]
    upload(alice, rid)
    alice.get(f"/records/{rid}/file")
    rows = db.scalars(select(AuditLog).where(AuditLog.resource_id == rid)).all()
    actions = {r.action for r in rows}
    assert {"record.create", "record.file_upload", "record.file_download"} <= actions
    assert "SECRET-NOTE" not in str([r.event_metadata for r in rows])


def test_requires_login_and_verified_email(app, outbox, make_actor):
    from tests.conftest import Actor

    anon = Actor(app, outbox, "anon@example.com")
    for path in ("/records", "/labs", "/labs/tests", "/labs/trend?test_name=x"):
        assert anon.get(path).status_code == 401, path
    u = make_actor(verified=False)
    assert u.post("/records", json=REC).status_code == 403
    assert u.post("/labs", json=HB).status_code == 403


# ------------------------------------------------------------------------- labs
@pytest.mark.parametrize(
    "value,low,high,flag",
    [
        (11.2, 12, 15.5, "low"),
        (13, 12, 15.5, "normal"),
        (16, 12, 15.5, "high"),
        (12, 12, 15.5, "normal"),
        (15.5, 12, 15.5, "normal"),
        (3, None, 5, "normal"),
        (6, None, 5, "high"),
        (1, 2, None, "low"),
        (5, None, None, "unknown"),
        (None, 1, 2, "unknown"),
    ],
)
def test_compute_flag(value, low, high, flag):
    assert compute_flag(value, low, high) == flag


def test_lab_flag_is_server_computed(alice):
    out = alice.post("/labs", json=HB)
    assert out.status_code == 201 and out.json()["flag"] == "low"
    assert alice.post("/labs", json={**HB, "flag": "normal"}).status_code == 422
    assert alice.post("/labs", json={**HB, "verification_status": "imported"}).status_code == 422
    lid = out.json()["id"]
    upd = alice.patch(f"/labs/{lid}", json={"value_numeric": 13.0}).json()
    assert upd["flag"] == "normal"
    assert alice.patch(f"/labs/{lid}", json={"ref_high": 12.5}).json()["flag"] == "high"


def test_lab_validation(alice):
    no_value = {k: v for k, v in HB.items() if k != "value_numeric"}
    assert alice.post("/labs", json=no_value).status_code == 422
    text_only = alice.post("/labs", json={**no_value, "value_text": "Positive"})
    assert text_only.status_code == 201 and text_only.json()["flag"] == "unknown"
    assert alice.post("/labs", json={**HB, "ref_low": 20, "ref_high": 10}).status_code == 422
    assert alice.post("/labs", json={**HB, "observed_on": "2099-01-01"}).status_code == 422
    assert alice.post("/labs", json={**HB, "test_name": "   "}).status_code == 422
    lid = alice.post("/labs", json=HB).json()["id"]
    assert alice.patch(f"/labs/{lid}", json={"ref_low": 99}).status_code == 422
    assert alice.patch(f"/labs/{lid}", json={"value_numeric": None}).status_code == 422
    assert alice.get("/labs?test_name=hemoglobin").json()["items"][0]["ref_low"] == 12.0


def test_lab_edit_resets_verification_but_notes_do_not(alice, db):
    lid = alice.post("/labs", json=HB).json()["id"]
    row = db.scalar(select(LabResult).where(LabResult.id == uuid.UUID(lid)))
    row.verification_status = "clinician_confirmed"
    db.commit()
    same = alice.patch(f"/labs/{lid}", json={"notes": "fasting", "value_numeric": 11.2}).json()
    assert same["verification_status"] == "clinician_confirmed"
    changed = alice.patch(f"/labs/{lid}", json={"value_numeric": 12.5}).json()
    assert changed["verification_status"] == "patient_reported"


def test_lab_links_only_to_own_record(alice, bob):
    rid = alice.post("/records", json=REC).json()["id"]
    assert alice.post("/labs", json={**HB, "record_id": rid}).status_code == 201
    assert alice.get(f"/labs?record_id={rid}").json()["total"] == 1
    assert bob.post("/labs", json={**HB, "record_id": rid}).status_code == 404
    own = bob.post("/labs", json=HB).json()["id"]
    assert bob.patch(f"/labs/{own}", json={"record_id": rid}).status_code == 404


def test_lab_isolation_between_patients(alice, bob):
    lid = alice.post("/labs", json=HB).json()["id"]
    assert bob.get("/labs").json()["total"] == 0
    assert bob.get("/labs/tests").json() == []
    assert bob.get("/labs/trend?test_name=Hemoglobin").status_code == 404
    resp = bob.patch(f"/labs/{lid}", json={"value_numeric": 99})
    assert resp.status_code == 404
    assert alice.get("/labs").json()["items"][0]["value_numeric"] == 11.2


def test_tests_summary_and_trend(alice):
    for day, val in (("2026-08-01", 13.0), ("2026-09-01", 12.4), ("2026-11-01", 11.2)):
        alice.post("/labs", json={**HB, "value_numeric": val, "observed_on": day})
    alice.post(
        "/labs",
        json={**HB, "test_name": "hemoglobin ", "value_numeric": 14.0, "observed_on": "2026-10-01"},
    )  # same test, different casing
    alice.post(
        "/labs",
        json={"test_name": "HIV screen", "value_text": "Negative", "observed_on": "2026-10-05"},
    )
    tests = {t["test_name"].lower(): t for t in alice.get("/labs/tests").json()}
    assert set(tests) == {"hemoglobin", "hiv screen"}
    assert tests["hemoglobin"]["count"] == 4
    assert tests["hemoglobin"]["latest_value_numeric"] == 11.2
    assert tests["hemoglobin"]["latest_flag"] == "low"
    assert tests["hiv screen"]["latest_value_text"] == "Negative"
    trend = alice.get("/labs/trend?test_name=HEMOGLOBIN").json()
    assert [p["observed_on"] for p in trend["points"]] == [
        "2026-08-01",
        "2026-09-01",
        "2026-10-01",
        "2026-11-01",
    ]
    assert trend["unit"] == "g/dL" and trend["ref_low"] == 12.0
    assert alice.get("/labs/trend?test_name=HIV screen").status_code == 404  # no numeric points


def test_archived_labs_leave_summaries_and_trends(alice):
    a = alice.post("/labs", json=HB).json()["id"]
    alice.post("/labs", json={**HB, "value_numeric": 13, "observed_on": "2026-11-05"})
    alice.patch(f"/labs/{a}", json={"status": "entered_in_error"})
    assert alice.get("/labs").json()["total"] == 1
    assert alice.get("/labs?include_archived=true").json()["total"] == 2
    assert len(alice.get("/labs/trend?test_name=Hemoglobin").json()["points"]) == 1
    assert alice.get("/labs/tests").json()[0]["count"] == 1


# ------------------------------------------------------------------- scan to fill + bulk labs
def _report_png() -> bytes:
    """A synthetic lab report rendered as a photo-like PNG (needs Pillow; skipped without)."""
    import io

    from PIL import Image, ImageDraw, ImageFont

    font = None
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ):
        try:
            font = ImageFont.truetype(path, 26)
            break
        except OSError:
            continue
    if font is None:
        pytest.skip("no TrueType font available to render a test report")
    lines = [
        "SUNRISE DIAGNOSTICS AND PATHOLOGY LAB",
        "Sample Collected: 12/11/2026",
        "COMPLETE BLOOD COUNT",
        "Test Name      Result    Unit       Reference Range",
        "Hemoglobin     11.2      g/dL       12.0 - 15.5",
        "Creatinine     0.9       mg/dL      0.6 - 1.2",
    ]
    img = Image.new("RGB", (1100, 360), "white")
    draw = ImageDraw.Draw(img)
    for i, line in enumerate(lines):
        draw.text((30, 20 + i * 44), line, fill="black", font=font)
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


@pytest.fixture
def roomy_uploads(app):
    """The suite caps uploads at 1 KB; a rendered report photo is larger than that.

    Opt-in (not autouse) so the upload-size tests above keep the 1 KB cap.
    """
    app.state.settings.max_upload_bytes = 2 * 1024 * 1024


def _scan(actor, data, name="photo.png"):
    return actor.post("/records/scan", files={"file": (name, data, "image/png")})


def _ocr_ready(alice) -> bool:
    return alice.get("/records/scan/status").json()["photos"]


@pytest.mark.usefixtures("roomy_uploads")
def test_scan_status_is_reported(alice):
    body = alice.get("/records/scan/status").json()
    assert set(body) == {"available", "photos", "pdf_text", "scanned_pdf"}


@pytest.mark.usefixtures("roomy_uploads")
def test_scan_reads_a_photo_and_saves_nothing(alice, db):
    if not _ocr_ready(alice):
        pytest.skip("Tesseract is not installed")
    out = _scan(alice, _report_png())
    assert out.status_code == 200, out.text
    body = out.json()
    assert body["method"] == "ocr" and body["text_found"] is True
    assert body["record"]["record_type"] == "lab_report"
    assert body["record"]["record_date"] == "2026-11-12"
    assert body["record"]["date_ambiguous"] is True  # 12/11 could be read either way
    rows = {r["test_name"].lower(): r for r in body["labs"]}
    hb = rows["hemoglobin"]
    assert (hb["result"], hb["unit"], hb["ref_low"], hb["ref_high"]) == ("11.2", "g/dL", 12.0, 15.5)
    assert any("Check every value" in w for w in body["warnings"])
    # A scan is only a draft: no record, no lab result and no stored file came from it.
    assert alice.get("/records").json()["total"] == 0
    assert alice.get("/labs").json()["total"] == 0
    assert db.scalar(select(AuditLog).where(AuditLog.action == "record.scan")) is not None


@pytest.mark.usefixtures("roomy_uploads")
def test_scan_audit_holds_counts_never_text(alice, db):
    if not _ocr_ready(alice):
        pytest.skip("Tesseract is not installed")
    _scan(alice, _report_png())
    row = db.scalar(select(AuditLog).where(AuditLog.action == "record.scan"))
    meta = row.event_metadata
    assert set(meta) == {"size", "content_type", "method", "pages", "lab_rows"}
    assert "Hemoglobin" not in str(meta)


@pytest.mark.usefixtures("roomy_uploads")
def test_scan_rejects_bad_uploads(alice):
    assert _scan(alice, b"").status_code == 422
    assert _scan(alice, b"just text, not a document").status_code == 415
    assert _scan(alice, b"\x89PNG\r\n\x1a\n" + b"not really an image").status_code in (
        422,
        503,
    )  # unreadable image, or no OCR installed here


@pytest.mark.usefixtures("roomy_uploads")
def test_scan_requires_a_verified_signed_in_user(app, outbox, make_actor):
    from tests.conftest import Actor

    anon = Actor(app, outbox, "scan-anon@example.com")
    assert anon.get("/records/scan/status").status_code == 401
    unverified = make_actor(verified=False)
    assert unverified.get("/records/scan/status").status_code == 403
    assert _scan(unverified, PNG).status_code == 403


@pytest.mark.usefixtures("roomy_uploads")
def test_scan_is_rate_limited(app, alice):
    if not _ocr_ready(alice):
        pytest.skip("Tesseract is not installed")
    app.state.settings.rate_limit_enabled = True
    limit = app.state.settings.scan_requests_per_minute
    codes = [_scan(alice, b"\x89PNG\r\n\x1a\nxx").status_code for _ in range(limit + 1)]
    assert codes[-1] == 429


def test_bulk_labs_save_all_with_server_flags_and_link(alice):
    rid = alice.post("/records", json=REC).json()["id"]
    items = [
        HB,
        {"test_name": "HIV", "value_text": "Non-reactive", "observed_on": "2026-11-01"},
    ]
    out = alice.post("/labs/bulk", json={"record_id": rid, "items": items})
    assert out.status_code == 201, out.text
    rows = out.json()
    assert [r["flag"] for r in rows] == ["low", "unknown"]  # computed by the server
    assert all(r["record_id"] == rid for r in rows)
    assert all(r["verification_status"] == "patient_reported" for r in rows)
    assert alice.get("/labs").json()["total"] == 2


def test_bulk_labs_is_all_or_nothing(alice):
    bad = {**HB, "test_name": "Bad range", "ref_low": 20.0, "ref_high": 10.0}
    out = alice.post("/labs/bulk", json={"items": [HB, bad]})
    assert out.status_code == 422
    assert alice.get("/labs").json()["total"] == 0


def test_bulk_labs_input_limits_and_server_controlled_fields(alice, bob):
    assert alice.post("/labs/bulk", json={"items": []}).status_code == 422
    assert alice.post("/labs/bulk", json={"items": [HB] * 61}).status_code == 422
    for extra in ({"verification_status": "clinician_confirmed"}, {"flag": "normal"}):
        assert alice.post("/labs/bulk", json={"items": [{**HB, **extra}]}).status_code == 422
    # a row cannot name its own report; only the request can, and only one the caller owns
    own_id = {**HB, "record_id": str(uuid.uuid4())}
    assert alice.post("/labs/bulk", json={"items": [own_id]}).status_code == 422
    theirs = bob.post("/records", json=REC).json()["id"]
    assert alice.post("/labs/bulk", json={"record_id": theirs, "items": [HB]}).status_code == 404
