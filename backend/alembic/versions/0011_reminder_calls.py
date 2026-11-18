"""phone-app devices and WebRTC reminder calls

Revision ID: 0011
Revises: 0010

Adds ``devices`` (installed phone apps that can be woken by push) and ``reminder_calls`` (one
row per attempt to ring a patient about a pending dose). The new consent type ``reminder_call``
needs no schema change: ``user_consents.consent_type`` is a free string.
"""
import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def _ts():
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("platform", sa.String(length=8), nullable=False),
        sa.Column("push_token", sa.Text(), nullable=False),
        sa.Column("voip_token", sa.Text(), nullable=True),
        sa.Column("app_version", sa.String(length=32), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        *_ts(),
        sa.CheckConstraint("platform IN ('android','ios')", name=op.f("ck_devices_platform_valid")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_devices_user_id_users"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_devices")),
        sa.UniqueConstraint("push_token", name="uq_devices_push_token"),
    )
    op.create_index("ix_devices_user_seen", "devices", ["user_id", "last_seen_at"], unique=False)

    op.create_table(
        "reminder_calls",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=True),
        sa.Column("dose_log_id", sa.Uuid(), nullable=False),
        sa.Column("dedupe_key", sa.String(length=120), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("ring_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_reason", sa.String(length=32), nullable=True),
        sa.Column("media_connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        *_ts(),
        sa.CheckConstraint(
            "status IN ('ringing','answered','completed','declined','missed','failed')",
            name=op.f("ck_reminder_calls_status_valid"),
        ),
        sa.CheckConstraint("attempt >= 1", name=op.f("ck_reminder_calls_attempt_positive")),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_reminder_calls_patient_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], name=op.f("fk_reminder_calls_device_id_devices"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["dose_log_id"], ["dose_logs.id"], name=op.f("fk_reminder_calls_dose_log_id_dose_logs"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reminder_calls")),
        sa.UniqueConstraint("patient_user_id", "dedupe_key", name="uq_reminder_calls_dedupe"),
    )
    op.create_index("ix_reminder_calls_dose", "reminder_calls", ["dose_log_id", "attempt"], unique=False)
    op.create_index("ix_reminder_calls_patient_created", "reminder_calls", ["patient_user_id", "created_at"], unique=False)
    op.create_index(op.f("ix_reminder_calls_device_id"), "reminder_calls", ["device_id"], unique=False)


def downgrade() -> None:
    op.drop_table("reminder_calls")
    op.drop_table("devices")
