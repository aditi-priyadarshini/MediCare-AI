"""Create SYNTHETIC demonstration accounts and data for a presentation or a manual test.

    DEMO_PASSWORD=... python -m app.scripts.seed_demo

Everything is invented (people, lab values, medicines, contacts) and every address uses the
reserved example.com domain. Data is created through the application's own API, so the same
validation, ownership and verification-status rules apply as for a real patient: seeded records
are "patient reported", never "clinician confirmed". The script refuses to run when
ENVIRONMENT=production, never prints the password, and is safe to run twice.
"""

import os
import sys
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.db import make_engine, make_sessionmaker
from app.core.security import hash_password
from app.identity import service as svc
from app.main import create_app

PATIENT_EMAIL = "demo.patient@example.com"
ADMIN_EMAIL = "demo.admin@example.com"
REVIEWER_EMAIL = "demo.reviewer@example.com"


def _ensure_user(db, email: str, name: str, password: str, role: str) -> None:
    user = svc.get_user_by_email(db, email)
    if user is None:
        svc.create_user(db, email, hash_password(password), name, email_verified=True, role=role)
    db.commit()


def _ok(resp, what: str):
    if resp.status_code >= 300:
        raise SystemExit(f"Seeding {what} failed: HTTP {resp.status_code} {resp.text[:200]}")
    return resp


def main() -> int:
    settings = get_settings()
    if settings.environment == "production":
        print("Refusing to create demo data in production.", file=sys.stderr)
        return 1
    password = os.environ.get("DEMO_PASSWORD")
    if not password:
        print("Set DEMO_PASSWORD (not printed, not stored).", file=sys.stderr)
        return 1
    problem = svc.validate_password(password, PATIENT_EMAIL)
    if problem:
        print(problem, file=sys.stderr)
        return 1

    sm = make_sessionmaker(make_engine(settings.database_url))
    with sm() as db:
        sm_ctx = sm()
    with sm_ctx as db:
        already = svc.get_user_by_email(db, PATIENT_EMAIL) is not None
        _ensure_user(db, PATIENT_EMAIL, "Demo Patient", password, "patient")
        _ensure_user(db, ADMIN_EMAIL, "Demo Admin", password, "admin")
        _ensure_user(db, REVIEWER_EMAIL, "Demo Reviewer", password, "admin")

    origin = settings.allowed_origins[0] if settings.allowed_origins else "http://localhost:3000"
    app = create_app(settings)

    def session_for(email: str):
        client = TestClient(app, headers={"Origin": origin})
        csrf = {"token": ""}

        def call(method: str, url: str, what: str, **kw):
            headers = {"X-CSRF-Token": csrf["token"]} if method != "GET" else {}
            return _ok(client.request(method, f"/api/v1{url}", headers=headers, **kw), what)

        login = call("POST", "/auth/login", "login", json={"email": email, "password": password})
        csrf["token"] = login.json()["csrf_token"]
        # The three required consents finish onboarding, so the account
        # opens on its dashboard instead of the onboarding screen.
        for consent in ("terms_of_service", "privacy_policy", "health_data_processing"):
            call("PUT", f"/consents/{consent}", f"consent {consent}", json={"granted": True})
        return call

    for email in (ADMIN_EMAIL, REVIEWER_EMAIL):
        session_for(email)
    call = session_for(PATIENT_EMAIL)
    if already:
        print("Demo accounts already exist; patient data was left as it is.")
        return 0

    call(
        "PUT",
        "/profile",
        "profile",
        json={
            "display_name": "Demo Patient",
            "date_of_birth": "1975-04-12",
            "preferred_language": "en",
            "timezone": "Asia/Kolkata",
            "height_cm": 168,
            "weight_kg": 72,
            "blood_group": "O+",
        },
    )
    call(
        "POST",
        "/conditions",
        "condition",
        json={"display_name": "Type 2 diabetes", "onset_date": "2020-03-01"},
    )
    call(
        "POST",
        "/allergies",
        "allergy",
        json={"substance": "Penicillin", "reaction": "Rash", "severity": "moderate"},
    )
    call(
        "POST",
        "/emergency/contacts",
        "contact",
        json={"name": "Demo Contact", "relationship": "Sibling", "phone_e164": "+910000000000"},
    )

    # A readable HbA1c story: four dated results in the same unit, with the report's own range.
    today = date.today()
    for months_ago, value in ((12, 8.4), (9, 8.0), (6, 7.6), (3, 7.1)):
        call(
            "POST",
            "/labs",
            "lab",
            json={
                "test_name": "HbA1c",
                "value_numeric": value,
                "unit": "%",
                "ref_low": 4.0,
                "ref_high": 5.6,
                "observed_on": (today - timedelta(days=30 * months_ago)).isoformat(),
            },
        )
    med = call(
        "POST",
        "/medications",
        "medication",
        json={
            "display_name": "Metformin",
            "dose_text": "500 mg",
            "units_per_dose": 1,
        },
    ).json()
    call(
        "POST",
        f"/medications/{med['id']}/schedules",
        "schedule",
        json={
            "times": ["08:00", "20:00"],
            "start_date": (today - timedelta(days=7)).isoformat(),
            "timezone": "Asia/Kolkata",
        },
    )
    call(
        "POST",
        "/feedback",
        "feedback",
        json={
            "category": "general",
            "message": "Demo feedback: the labs trend chart is easy to read.",
        },
    )
    print(
        f"Created synthetic demo data. Sign in as {PATIENT_EMAIL}, {ADMIN_EMAIL} or "
        f"{REVIEWER_EMAIL} with DEMO_PASSWORD. Not real data."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
