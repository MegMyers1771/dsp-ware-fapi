"""add sync flags to tabs

Revision ID: add_tab_sync_fields
Revises: None
Create Date: 2025-02-28 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "add_tab_sync_fields"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tabs",
        sa.Column("enable_sync", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "tabs",
        sa.Column("sync_config", sa.String(), nullable=True),
    )
    op.alter_column("tabs", "enable_sync", server_default=None)


def downgrade() -> None:
    op.drop_column("tabs", "sync_config")
    op.drop_column("tabs", "enable_sync")
