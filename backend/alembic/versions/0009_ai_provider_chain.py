"""Assistant disclosure log can name several providers (failover chain)

Revision ID: 0009
Revises: 0008
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("chat_context_access_logs", "provider", type_=sa.String(length=128), existing_nullable=False)


def downgrade() -> None:
    op.alter_column("chat_context_access_logs", "provider", type_=sa.String(length=32), existing_nullable=False)
