"""AI assistant: chat sessions, messages, evidence references, context access log

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-15 18:00:00.000000
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("language", sa.String(length=8), nullable=False),
        sa.Column("context_mode", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("language IN ('en','hi','or')", name=op.f("ck_chat_sessions_language_valid")),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_chat_sessions_patient_user_id_users"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_sessions")),
    )
    op.create_index("ix_chat_sessions_patient", "chat_sessions", ["patient_user_id", "updated_at"], unique=False)

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=12), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("safety_classification", sa.String(length=24), nullable=True),
        sa.Column("model_metadata", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("role IN ('user','assistant')", name=op.f("ck_chat_messages_role_valid")),
        sa.CheckConstraint(
            "safety_classification IS NULL OR safety_classification IN "
            "('answered','evidence_only','fallback','no_data','urgent_escalation',"
            "'declined_treatment','declined_diagnosis')",
            name=op.f("ck_chat_messages_classification_valid"),
        ),
        sa.ForeignKeyConstraint(["session_id"], ["chat_sessions.id"], name=op.f("fk_chat_messages_session_id_chat_sessions"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_messages")),
    )
    op.create_index("ix_chat_messages_session", "chat_messages", ["session_id", "created_at"], unique=False)

    op.create_table(
        "ai_evidence_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("message_id", sa.Uuid(), nullable=False),
        sa.Column("ref_label", sa.String(length=8), nullable=False),
        sa.Column("source_type", sa.String(length=16), nullable=False),
        sa.Column("source_record_id", sa.Uuid(), nullable=True),
        sa.Column("source_label", sa.Text(), nullable=False),
        sa.Column("recorded_at", sa.Date(), nullable=True),
        sa.Column("verification_status", sa.String(length=24), nullable=True),
        sa.Column("excerpt_hash", sa.String(length=64), nullable=False),
        sa.Column("cited", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint(
            "source_type IN ('lab_result','medication','dose_log','condition','allergy',"
            "'health_record','reference','derived')",
            name=op.f("ck_ai_evidence_items_source_type_valid"),
        ),
        sa.ForeignKeyConstraint(["message_id"], ["chat_messages.id"], name=op.f("fk_ai_evidence_items_message_id_chat_messages"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_evidence_items")),
    )
    op.create_index("ix_ai_evidence_items_message", "ai_evidence_items", ["message_id"], unique=False)

    op.create_table(
        "chat_context_access_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=True),
        sa.Column("message_id", sa.Uuid(), nullable=True),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("context", postgresql.JSONB(), nullable=False),
        sa.Column("sources", postgresql.JSONB(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_chat_context_access_logs_patient_user_id_users"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_context_access_logs")),
    )
    op.create_index("ix_chat_context_access_logs_patient", "chat_context_access_logs", ["patient_user_id", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_table("chat_context_access_logs")
    op.drop_table("ai_evidence_items")
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
