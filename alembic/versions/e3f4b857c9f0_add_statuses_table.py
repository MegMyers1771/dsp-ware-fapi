"""add statuses table

Revision ID: e3f4b857c9f0
Revises: b1b45e2adf30
Create Date: 2025-11-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e3f4b857c9f0"
down_revision: Union[str, Sequence[str], None] = "b1b45e2adf30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "statuses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("color", sa.String(), nullable=False, server_default="#0d6efd"),
    )
    op.execute("UPDATE statuses SET color = '#0d6efd'")
    op.alter_column("statuses", "color", server_default=None)


def downgrade() -> None:
    op.drop_table("statuses")
