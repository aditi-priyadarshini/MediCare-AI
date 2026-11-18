from sqlalchemy import select

from app.audit.models import AuditLog

FULL = {
    "display_name": "Alice Das",
    "date_of_birth": "1990-05-17",
    "preferred_language": "or",
    "timezone": "Asia/Kolkata",
    "height_cm": 165.5,
    "weight_kg": 58.2,
    "blood_group": "O+",
    "accessibility_preferences": {"large_text": True, "high_contrast": True},
}


def test_profile_defaults(alice):
    p = alice.get("/profile").json()
    assert p["display_name"] == "Test User"
    assert p["preferred_language"] == "en" and p["timezone"] == "Asia/Kolkata"
    assert p["blood_group"] is None and p["blood_group_verification_status"] == "unverified"
    assert p["onboarding_completed"] is False and p["completeness"] == 0
    assert p["accessibility_preferences"]["large_text"] is False


def test_profile_update_roundtrip(alice):
    resp = alice.put("/profile", json=FULL)
    assert resp.status_code == 200
    p = alice.get("/profile").json()
    assert p["date_of_birth"] == "1990-05-17" and p["preferred_language"] == "or"
    assert p["height_cm"] == 165.5 and p["weight_kg"] == 58.2
    assert p["accessibility_preferences"] == {
        "large_text": True,
        "high_contrast": True,
        "reduce_motion": False,
        "voice_enabled": False,
    }
    assert p["completeness"] == 75  # DOB, height+weight, blood group; no emergency contact yet


def test_blood_group_is_never_self_confirmed(alice):
    p = alice.put("/profile", json=FULL).json()
    assert p["blood_group_verification_status"] == "patient_reported"
    # The client cannot assert a verification status.
    forged = alice.put(
        "/profile", json={**FULL, "blood_group_verification_status": "clinician_confirmed"}
    )
    assert forged.status_code == 422
    cleared = alice.put("/profile", json={**FULL, "blood_group": None}).json()
    assert cleared["blood_group_verification_status"] == "unverified"


def test_profile_validation(alice):
    bad = [
        {**FULL, "timezone": "Mars/Olympus"},
        {**FULL, "date_of_birth": "2999-01-01"},
        {**FULL, "height_cm": 5},
        {**FULL, "weight_kg": 900},
        {**FULL, "blood_group": "Z+"},
        {**FULL, "preferred_language": "fr"},
        {**FULL, "display_name": "   "},
        {**FULL, "accessibility_preferences": {"large_text": True, "bogus": 1}},
    ]
    for body in bad:
        assert alice.put("/profile", json=body).status_code == 422, body


def test_cannot_change_role_or_ownership_via_profile(alice):
    assert alice.put("/profile", json={**FULL, "role": "admin"}).status_code == 422
    assert alice.put("/profile", json={**FULL, "user_id": "x"}).status_code == 422


def test_profiles_are_isolated(alice, bob):
    alice.put("/profile", json=FULL)
    assert bob.get("/profile").json()["display_name"] == "Test User"
    assert bob.get("/profile").json()["blood_group"] is None


def test_profile_requires_authentication(app, outbox):
    from tests.conftest import Actor

    assert Actor(app, outbox, "anon@example.com").get("/profile").status_code == 401


# ----------------------------------------------------------------------- consents
def test_consents_default_to_not_granted(alice):
    consents = {c["consent_type"]: c for c in alice.get("/consents").json()}
    assert set(consents) == {
        "terms_of_service",
        "privacy_policy",
        "health_data_processing",
        "ai_context",
        "reminder_email",
        "reminder_call",
    }
    assert not any(c["granted"] for c in consents.values())
    assert consents["ai_context"]["required"] is False
    assert consents["reminder_email"]["required"] is False
    assert consents["privacy_policy"]["required"] is True


def test_onboarding_completes_when_required_consents_granted(alice):
    for ctype in ("terms_of_service", "privacy_policy"):
        alice.put(f"/consents/{ctype}", json={"granted": True})
    assert alice.get("/profile").json()["onboarding_completed"] is False
    alice.put("/consents/health_data_processing", json={"granted": True})
    assert alice.get("/profile").json()["onboarding_completed"] is True
    # AI context consent is optional and independent of onboarding.
    assert (
        next(c for c in alice.get("/consents").json() if c["consent_type"] == "ai_context")[
            "granted"
        ]
        is False
    )


def test_revoking_consent_is_recorded_and_audited(alice, db):
    alice.put("/consents/ai_context", json={"granted": True})
    out = alice.put("/consents/ai_context", json={"granted": False}).json()
    assert next(c for c in out if c["consent_type"] == "ai_context")["granted"] is False
    actions = [r.action for r in db.scalars(select(AuditLog).order_by(AuditLog.created_at))]
    assert "consent.granted" in actions and "consent.revoked" in actions


def test_unknown_consent_type_rejected(alice):
    assert alice.put("/consents/marketing", json={"granted": True}).status_code == 422


def test_consents_are_per_user(alice, bob):
    alice.put("/consents/ai_context", json={"granted": True})
    assert (
        next(c for c in bob.get("/consents").json() if c["consent_type"] == "ai_context")["granted"]
        is False
    )
