"""capacity for boxes

Revision ID: 0ff58106f49c
Revises: 4e59c2165a1f
Create Date: 2025-11-26 17:40:48.523661

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0ff58106f49c'
down_revision: Union[str, Sequence[str], None] = '4e59c2165a1f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("boxes", sa.Column("capacity", sa.Integer(), nullable=True))

def downgrade() -> None:
    op.drop_column("boxes", "capacity")