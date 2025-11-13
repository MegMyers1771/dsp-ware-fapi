"""add invoice_number to item_utilized

Revision ID: bc7f5c5fd1a0
Revises: 7c6a7f2e1c9d
Create Date: 2025-12-02 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "bc7f5c5fd1a0"
down_revision: Union[str, Sequence[str], None] = "7c6a7f2e1c9d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("item_utilized", sa.Column("invoice_number", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("item_utilized", "invoice_number")
