# TEMPORARY diagnostic for CI. Fails on purpose so the numbers show in the CI log. Delete after.
import importlib.metadata as md

from tests.test_records import PDF, REC, upload


def test_debug_upload(alice):
    rid = alice.post("/records", json=REC).json()["id"]
    data = PDF + b"0" * 2000
    resp = upload(alice, rid, data)
    versions = []
    for pkg in ("fastapi", "starlette", "python-multipart", "httpx", "pydantic-settings"):
        try:
            versions.append(f"{pkg}={md.version(pkg)}")
        except md.PackageNotFoundError:
            versions.append(f"{pkg}=missing")
    info = (
        f"sent={len(data)} limit={alice.app.state.settings.max_upload_bytes} "
        f"status={resp.status_code} stored_file_size={resp.json().get('file_size')} "
        + " ".join(versions)
    )
    raise AssertionError("DEBUG " + info)
