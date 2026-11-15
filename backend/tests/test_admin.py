from sqlalchemy import select

from app.audit.models import AuditLog
from app.identity.models import User


def _promote(db, email):
    db.execute(User.__table__.update().where(User.email == email).values(role="admin"))
    db.commit()


def test_patient_cannot_access_admin_endpoints(alice):
    resp = alice.get("/admin/users")
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"


def test_admin_requires_authentication(app, outbox):
    from tests.conftest import Actor

    assert Actor(app, outbox, "x@example.com").get("/admin/users").status_code == 401


def test_admin_can_list_users_without_health_data(make_actor, db):
    make_actor("p1@example.com")
    admin = make_actor("boss@example.com")
    _promote(db, "boss@example.com")
    resp = admin.get("/admin/users")
    assert resp.status_code == 200
    page = resp.json()
    assert page["total"] == 2
    assert {u["email"] for u in page["items"]} == {"p1@example.com", "boss@example.com"}
    assert set(page["items"][0]) == {
        "id",
        "email",
        "role",
        "is_active",
        "email_verified",
        "created_at",
    }
    assert "password_hash" not in resp.text
    assert db.scalar(select(AuditLog).where(AuditLog.action == "admin.users_listed")) is not None


def test_role_cannot_be_self_assigned_at_registration(app, outbox):
    from tests.conftest import Actor

    a = Actor(app, outbox, "sneaky@example.com")
    resp = a.post(
        "/auth/register",
        json={"email": a.email, "password": a.password, "display_name": "S", "role": "admin"},
    )
    assert resp.status_code == 201
    assert resp.json()["user"]["role"] == "patient"
