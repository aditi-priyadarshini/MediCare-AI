"""sharing (grants, recipient codes, access log) and emergency (settings, practice runs)

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-16 12:00:00.000000
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "share_grants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("recipient_name", sa.Text(), nullable=False),
        sa.Column("recipient_email", sa.Text(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("categories", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("date_from", sa.Date(), nullable=True),
        sa.Column("date_to", sa.Date(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("access_count", sa.Integer(), nullable=False),
        *_ts(),
        sa.CheckConstraint(
            "date_from IS NULL OR date_to IS NULL OR date_from <= date_to",
            name=op.f("ck_share_grants_dates_valid"),
        ),
        sa.CheckConstraint(
            "jsonb_typeof(categories) = 'array' AND categories <> '[]'::jsonb",
            name=op.f("ck_share_grants_categories_valid"),
        ),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_share_grants_patient_user_id_users"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_share_grants")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_share_grants_token_hash")),
    )
    op.create_index("ix_share_grants_patient_created", "share_grants", ["patient_user_id", "created_at"])

    op.create_table(
        "share_access_challenges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("grant_id", sa.Uuid(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["grant_id"], ["share_grants.id"], name=op.f("fk_share_access_challenges_grant_id_share_grants"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_share_access_challenges")),
    )
    op.create_index(op.f("ix_share_access_challenges_grant_id"), "share_access_challenges", ["grant_id"])

    op.create_table(
        "share_access_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("grant_id", sa.Uuid(), nullable=False),
        sa.Column("event", sa.String(length=24), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "event IN ('code_sent','code_failed','verified','viewed','blocked_revoked','blocked_expired')",
            name=op.f("ck_share_access_logs_event_valid"),
        ),
        sa.ForeignKeyConstraint(["grant_id"], ["share_grants.id"], name=op.f("fk_share_access_logs_grant_id_share_grants"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_share_access_logs")),
    )
    op.create_index("ix_share_access_logs_grant_created", "share_access_logs", ["grant_id", "created_at"])

    op.create_table(
        "emergency_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("include_blood_group", sa.Boolean(), nullable=False),
        sa.Column("include_allergies", sa.Boolean(), nullable=False),
        sa.Column("include_conditions", sa.Boolean(), nullable=False),
        sa.Column("include_medications", sa.Boolean(), nullable=False),
        sa.Column("include_contacts", sa.Boolean(), nullable=False),
        *_ts(),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_emergency_settings_patient_user_id_users"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_emergency_settings")),
        sa.UniqueConstraint("patient_user_id", name=op.f("uq_emergency_settings_patient_user_id")),
    )

    op.create_table(
        "emergency_simulations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("mode", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("location_shared", sa.Boolean(), nullable=False),
        sa.Column("history", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        *_ts(),
        sa.CheckConstraint("mode = 'simulated'", name=op.f("ck_emergency_simulations_mode_simulated")),
        sa.CheckConstraint(
            "status IN ('requested','acknowledged','en_route','arrived','cancelled')",
            name=op.f("ck_emergency_simulations_status_valid"),
        ),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_emergency_simulations_patient_user_id_users"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_emergency_simulations")),
    )
    op.create_index("ix_emergency_simulations_patient_created", "emergency_simulations", ["patient_user_id", "created_at"])


def downgrade() -> None:
    op.drop_table("emergency_simulations")
    op.drop_table("emergency_settings")
    op.drop_table("share_access_logs")
    op.drop_table("share_access_challenges")
    op.drop_table("share_grants")
