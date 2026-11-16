"""Phase 9: platform feedback, safety-rule versioning and peer review, append-only audit log

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-16 15:00:00.000000
"""
import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- platform feedback (separate from clinical adverse-event reports) -------------------
    op.create_table(
        "feedback",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("page", sa.String(length=120), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="new", nullable=False),
        sa.Column("moderator_note", sa.Text(), nullable=True),
        sa.Column("moderated_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("moderated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "category IN ('general','bug','accessibility','content','other')",
            name=op.f("ck_feedback_category_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('new','reviewed','actioned','dismissed')",
            name=op.f("ck_feedback_status_valid"),
        ),
        sa.CheckConstraint(
            "status = 'new' OR (moderated_by_user_id IS NOT NULL AND moderated_at IS NOT NULL)",
            name=op.f("ck_feedback_moderation_recorded"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_feedback_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["moderated_by_user_id"], ["users.id"], name=op.f("fk_feedback_moderated_by_user_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_feedback")),
    )
    op.create_index("ix_feedback_status_created", "feedback", ["status", "created_at"])
    op.create_index("ix_feedback_user", "feedback", ["user_id", "created_at"])

    # ---- safety-rule versioning and second-person review -----------------------------------
    op.add_column("safety_rules", sa.Column("version", sa.Integer(), server_default="1", nullable=False))
    op.add_column("safety_rules", sa.Column("supersedes_rule_id", sa.Uuid(), nullable=True))
    op.add_column("safety_rules", sa.Column("review_status", sa.String(length=12), server_default="unreviewed", nullable=False))
    op.add_column("safety_rules", sa.Column("reviewed_by_user_id", sa.Uuid(), nullable=True))
    op.add_column("safety_rules", sa.Column("peer_reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        op.f("fk_safety_rules_supersedes_rule_id_safety_rules"),
        "safety_rules", "safety_rules", ["supersedes_rule_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_safety_rules_reviewed_by_user_id_users"),
        "safety_rules", "users", ["reviewed_by_user_id"], ["id"], ondelete="SET NULL",
    )
    op.create_check_constraint(
        op.f("ck_safety_rules_review_status_valid"), "safety_rules", "review_status IN ('unreviewed','approved')"
    )
    # An approval must name a reviewer and time, and the reviewer cannot be the author.
    op.create_check_constraint(
        op.f("ck_safety_rules_review_is_second_person"),
        "safety_rules",
        "review_status = 'unreviewed' OR (reviewed_by_user_id IS NOT NULL AND peer_reviewed_at IS NOT NULL "
        "AND reviewed_by_user_id IS DISTINCT FROM created_by_user_id)",
    )
    op.create_check_constraint(op.f("ck_safety_rules_version_positive"), "safety_rules", "version >= 1")
    op.create_index("ix_safety_rules_supersedes_rule_id", "safety_rules", ["supersedes_rule_id"])

    # ---- audit log: append-only, enforced by the database -----------------------------------
    op.create_index("ix_audit_logs_created", "audit_logs", ["created_at"])
    op.create_index("ix_audit_logs_action_created", "audit_logs", ["action", "created_at"])
    op.execute(
        """
        CREATE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_logs is append-only (% not allowed)', TG_OP
                USING ERRCODE = 'restrict_violation';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        "CREATE TRIGGER audit_logs_no_change BEFORE UPDATE OR DELETE ON audit_logs "
        "FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only()"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_logs_no_change ON audit_logs")
    op.execute("DROP FUNCTION IF EXISTS audit_logs_append_only()")
    op.drop_index("ix_audit_logs_action_created", table_name="audit_logs")
    op.drop_index("ix_audit_logs_created", table_name="audit_logs")
    op.drop_index("ix_safety_rules_supersedes_rule_id", table_name="safety_rules")
    for name in ("version_positive", "review_is_second_person", "review_status_valid"):
        op.drop_constraint(op.f(f"ck_safety_rules_{name}"), "safety_rules", type_="check")
    op.drop_constraint(op.f("fk_safety_rules_reviewed_by_user_id_users"), "safety_rules", type_="foreignkey")
    op.drop_constraint(op.f("fk_safety_rules_supersedes_rule_id_safety_rules"), "safety_rules", type_="foreignkey")
    for col in ("peer_reviewed_at", "reviewed_by_user_id", "review_status", "supersedes_rule_id", "version"):
        op.drop_column("safety_rules", col)
    op.drop_table("feedback")
