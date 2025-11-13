"""add serial number to item utilized

Revision ID: 3f8f84d8c2de
Revises: f6d1a1b6dc1d
Create Date: 2025-12-01 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3f8f84d8c2de"
down_revision: Union[str, Sequence[str], None] = "f6d1a1b6dc1d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("item_utilized", sa.Column("serial_number", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("item_utilized", "serial_number")
