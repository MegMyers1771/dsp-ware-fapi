"""drop archived_at from item_utilized

Revision ID: 7c6a7f2e1c9d
Revises: 3f8f84d8c2de
Create Date: 2025-12-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7c6a7f2e1c9d"
down_revision: Union[str, Sequence[str], None] = "3f8f84d8c2de"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("item_utilized", "archived_at")


def downgrade() -> None:
    op.add_column(
        "item_utilized",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.alter_column("item_utilized", "archived_at", server_default=None)
