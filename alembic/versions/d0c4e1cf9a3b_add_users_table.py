"""add users table

Revision ID: d0c4e1cf9a3b
Revises: bc7f5c5fd1a0
Create Date: 2025-12-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d0c4e1cf9a3b"
down_revision: Union[str, Sequence[str], None] = "bc7f5c5fd1a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="viewer"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.alter_column("users", "role", server_default=None)
    op.alter_column("users", "is_active", server_default=None)


def downgrade() -> None:
    op.drop_table("users")
