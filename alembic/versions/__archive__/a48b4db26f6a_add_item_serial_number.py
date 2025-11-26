"""add item serial number

Revision ID: a48b4db26f6a
Revises: add_tab_sync_fields
Create Date: 2025-11-26 13:42:12.056671

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a48b4db26f6a'
down_revision: Union[str, Sequence[str], None] = 'add_tab_sync_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("items", sa.Column("serial_number", sa.String(), nullable=True))
    pass


def downgrade() -> None:
    op.drop_column("items", "serial_number")
    pass
